import aws
import auth
import boto3
import os
import PyPDF2
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv, find_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import uuid
import string
import random
import dynamodb_helper as db

# import aws_cdk as cdk
# from lib.quiz_stack import QuizRealtimeStack

# app = cdk.App()
# QuizRealtimeStack(app, "QuizRealtimeStack")
# app.synth()

from werkzeug.utils import secure_filename


dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"Loaded .env from: {dotenv_path}")
else:
    print("No .env file found (falling back to shell environment / instance role)")
bedrock = None
dynamo = None
s3 = None
app = Flask(__name__)
# Enables cross-origin resource sharing support
# (Allows app to make requests to other domains)
CORS(app)

@app.route('/api/aws/buckets', methods=['GET'])
def list_buckets():
    """List S3 buckets using boto3. Reads AWS credentials from environment or from IAM role."""
    try:
        # Create an S3 client. Credentials are pulled from environment or IAM role automatically.
        s3 = boto3.client('s3', region_name=os.getenv('AWS_REGION'))
        resp = s3.list_buckets()
        buckets = [b['Name'] for b in resp.get('Buckets', [])]
        return jsonify({"buckets": buckets}), 200
    except (BotoCoreError, ClientError) as e:
        # Return structured error for easier debugging in frontend
        return jsonify({"error": str(e)}), 500


@app.route('/api/debug/env', methods=['GET'])
def debug_env():
    """Non-sensitive debug endpoint: shows presence of key env vars (does NOT return secret values)."""
    present = {
        'AWS_ACCESS_KEY_ID_present': bool(os.getenv('AWS_ACCESS_KEY_ID')),
        'AWS_SECRET_ACCESS_KEY_present': bool(os.getenv('AWS_SECRET_ACCESS_KEY')),
        'AWS_REGION': os.getenv('AWS_REGION') or None,
        'FLASK_ENV': os.getenv('FLASK_ENV')
    }
    return jsonify(present), 200


@app.route('/api/debug/identity', methods=['GET'])
def debug_identity():
    """Return non-sensitive STS caller identity (account/ARN) or an error message."""
    try:
        sts = boto3.client('sts')
        identity = sts.get_caller_identity()
        # Only return non-secret fields
        return jsonify({
            'Account': identity.get('Account'),
            'Arn': identity.get('Arn'),
            'UserId': identity.get('UserId')
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/parse_response', methods=['POST'])
def parse_response():
    # Use AWSParse response. Takes self, an input block of text, and an array of arrays. Each element in the
    # Array is a triple containing a name, a description, and a type of each expected return val
    # Returns a json parsed with nova-micro of the response
    try:
        global bedrock
        if bedrock is None:
            bedrock = aws.Bedrock()

        data = request.get_json(silent=True) or {}
        input_text = data.get('input_text', '')
        expected_output = data.get('expected_output', [])
        app.logger.info(f"Parsing response for input_text: {input_text} with expected_output: {expected_output}")
        parsed = bedrock.parse_response(input_text=input_text, expected_output=expected_output)

        # If parse_response returned a raw fallback, forward it so frontend can inspect
        if isinstance(parsed, dict) and parsed.get('raw'):
            return jsonify({'raw': parsed.get('raw')}), 200

        # If parsed is a dict containing the expected fields, return it directly.
        if isinstance(parsed, dict):
            return jsonify(parsed), 200

        # For non-dict parsed values, wrap under `parsed` key to keep response JSON-safe
        return jsonify({'parsed': parsed}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate_desc', methods=["GET"])
def generate_desc():
    try:
        global bedrock
        if bedrock is None:
            bedrock = aws.Bedrock()

        prompt = request.headers.get("X-Prompt")
        app.logger.info(f"Generating description for prompt: {prompt}")
        return jsonify({"description":bedrock.generate_desc(prompt=prompt)}),200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate_mcq', methods=["GET", "POST"])
def generate_mcq():
    try:
        global bedrock
        if bedrock is None:
            bedrock = aws.Bedrock()


        # Support POST with JSON body for better client semantics, fall back to headers for GET
        if request.method == 'POST' or request.is_json:
            data = request.get_json(silent=True) or {}
            num_questions = int(data.get('num_questions', data.get('numQuestions', 1)))
            topic = data.get('topic') or data.get('prompt')
        else:
            num_questions = int(request.headers.get("X-Num-Questions", 1))
            topic = request.headers.get("X-Topic")

        result = bedrock.generate_mcq(num_questions, prompt=topic)

        # If aws returned an error dict, surface it
        if isinstance(result, dict) and result.get('Error'):
            return jsonify(result), 500

        # If aws returned the mock shape {'output': [...]}
        if isinstance(result, dict) and result.get('output') and isinstance(result.get('output'), list):
            return jsonify({ 'questions': result.get('output') }), 200

        # If aws returned a string (model text), try to parse JSON
        if isinstance(result, str):
            try:
                parsed = json.loads(result)
                if isinstance(parsed, list):
                    return jsonify({ 'questions': parsed }), 200
                if isinstance(parsed, dict) and parsed.get('questions'):
                    return jsonify({ 'questions': parsed.get('questions') }), 200
                if isinstance(parsed, dict):
                    return jsonify({ 'questions': [parsed] }), 200
            except Exception:
                # fallback: split into non-empty lines
                lines = [l.strip() for l in result.split('\n') if l.strip()]
                if lines:
                    return jsonify({ 'questions': lines }), 200
            # final fallback: return raw text
            return jsonify({ 'raw': result }), 200

        # If aws returned a dict we didn't explicitly handle, return it under 'raw'
        return jsonify({ 'raw': result }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/create_quiz', methods=['POST'])
def create_quiz():
    try:
        key = request.headers.get("X-Key")
        if not key:
            return jsonify({"error": "X-Key header is required"}), 400
        
        headers = {'X-Key': key}
        response = get()
        questions = response["data"]["questions"]
        name = response["data"]["name"]
        sessionID = generate_session_id()
        
        global dynamo
        if dynamo == None:
            dynamo = aws.DynamoDB()
        json_data = {
            "sessionID" : sessionID,
            "players" : [],
            "questions": questions
        }
        dynamo.put_session(json_data)
        return {"ok" : True, "sessionID": sessionID}
        
    except Exception as e:
        return {"ok": False, "error":str(e)}



def generate_session_id():
    return ''.join(random.choices(string.ascii_uppercase, k=6))

@app.route("/api/get",methods=["GET"])
def get():
    global s3
    if s3 == None:
        s3 = aws.S3()
    
    try:
        key = request.headers.get("X-Key")
        return s3.load_from_s3(id=key)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/save", methods=["POST"])
def save():
    global s3
    if s3 == None:
        s3 = aws.S3()
    try:
        data = request.get_json(silent=True) or {}
        # Accept optional filename and key from header or JSON body
        key = request.headers.get("X-Key") or data.get('key')
        filename = data.get('filename') or data.get('name')

        # Call aws.save_to_s3 with filename/key if provided. aws.save_to_s3 will generate a key if None.
        result = s3.save_to_s3(data, filename=filename, key=key)
        if isinstance(result, dict) and result.get('ok'):
            return jsonify({ 'ok': True, 'key': result.get('key'), 'bucket': result.get('bucket') }), 200
        return jsonify({ 'error': result }), 500
        
    except Exception as e:
        return jsonify({"error": "Failed to save"}), 500



# add routes for chatbot and uploading material

@app.route('/api/chatbot', methods=['POST'])
def chatbot():
    """Handle chatbot conversation logic"""
    data = request.get_json()
    message = data.get('message', '').lower()
    conversation_state = data.get('conversationState', 'topics')
    user_data = data.get('userData', {'topics': [], 'materials': []})
    
    response = ""
    next_state = conversation_state
    updated_user_data = user_data.copy()
    
    if conversation_state == 'topics':
        if any(keyword in message for keyword in ['math', 'science', 'history', 'literature', 'programming']):
            # Extract topics from message
            topics = extract_topics(message)
            updated_user_data['topics'].extend(topics)
            response = f"Great! I've noted you want to learn about {', '.join(topics)}. " \
                      "Now, would you like to upload any study materials like lecture notes or practice problems?"
            next_state = 'materials'
        else:
            response = "I'd love to help you learn! What subjects are you interested in? " \
                      "For example: mathematics, science, history, literature, programming, etc."
    
    elif conversation_state == 'materials':
        if 'yes' in message or 'upload' in message:
            response = "Perfect! You can upload your study materials using the file upload button. " \
                      "I accept PDF, text, and document files. Once you've uploaded everything, " \
                      "I'll create a personalized quiz for you!"
            next_state = 'waiting_for_upload'
        elif 'no' in message:
            response = "No problem! I can create a quiz based on the topics you mentioned. " \
                      "Would you like me to generate some practice questions now?"
            next_state = 'generate_quiz'
        else:
            response = "Would you like to upload study materials, or should I create a quiz " \
                      "based on the topics you mentioned?"
    
    elif conversation_state == 'waiting_for_upload':
        response = "I'm ready to process your uploaded materials. Please use the file upload button " \
                  "to add your study materials."
    
    elif conversation_state == 'generate_quiz':
        response = "Excellent! I'll create a personalized quiz based on your topics and materials. " \
                  "Let me generate some questions for you..."
        # Here you would call your quiz generation logic
        next_state = 'quiz_ready'
    
    return jsonify({
        'response': response,
        'nextState': next_state,
        'updatedUserData': updated_user_data
    })

def extract_topics(message):
    """Extract learning topics from user message"""
    topic_keywords = {
        'math': ['math', 'mathematics', 'algebra', 'calculus', 'geometry', 'statistics'],
        'science': ['science', 'physics', 'chemistry', 'biology', 'anatomy'],
        'history': ['history', 'historical', 'ancient', 'medieval', 'world war'],
        'literature': ['literature', 'english', 'writing', 'poetry', 'novels'],
        'programming': ['programming', 'coding', 'python', 'javascript', 'java', 'web development']
    }
    
    found_topics = []
    for topic, keywords in topic_keywords.items():
        if any(keyword in message for keyword in keywords):
            found_topics.append(topic)
    
    return found_topics

@app.route('/api/upload-material', methods=['POST'])
def upload_material():
    """Handle file uploads for study materials"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        # Create uploads directory if it doesn't exist
        upload_dir = 'uploads'
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
        
        # Generate unique filename
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(upload_dir, unique_filename)
        file.save(file_path)
        
        # Process the file content
        content = extract_file_content(file_path)
        
        # Update user data
        user_data = json.loads(request.form.get('userData', '{}'))
        user_data['materials'].append({
            'filename': filename,
            'path': file_path,
            'content': content[:1000]  # Store first 1000 chars for preview
        })
        
        response = f"Great! I've processed your {filename} file. " \
                  "I can see it contains information about your study topics. " \
                  "Would you like to upload more materials or should I create your quiz now?"
        
        return jsonify({
            'response': response,
            'nextState': 'materials',
            'updatedUserData': user_data
        })
    
    return jsonify({'error': 'Invalid file type'}), 400


@app.route('/api/game/create', methods=['GET','POST'], endpoint='game_create')
def game_create_route():
    host_id = request.args.get('hostId') or request.form.get('hostId') or 'host123'
    seconds = int(request.args.get('secondsPerQuestion') or request.form.get('secondsPerQuestion') or 20)
    
    game_id = db.create_game(host_id, seconds)
    game_id = db.create_game(host_id, seconds)
    return jsonify({'gameId': game_id}), 201



@app.route('/api/game/<game_id>/join', methods=['POST'], endpoint='game_join')
def game_join_route(game_id):
    data = request.get_json(silent=True)
    if not data:
        raw = (request.data or b'').decode('utf-8', errors='ignore')
        try:
            data = json.loads(raw) if raw.strip() else {}
        except Exception:
            return jsonify({"error": "Invalid JSON", "raw": raw}), 400

    player_id = data.get('playerId')
    name = data.get('name')
    if not player_id or not name:
        return jsonify({"error": "playerId and name are required"}), 400

    item = db.join_game(game_id, player_id, name)
    return jsonify({'player': item}), 200

def allowed_file(filename):
    """Check if file type is allowed"""
    ALLOWED_EXTENSIONS = {'txt', 'pdf', 'doc', 'docx'}
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_file_content(file_path):
    """Extract text content from uploaded file"""
    try:
        if file_path.endswith('.txt'):
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        elif file_path.endswith('.pdf'):

            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                text = ""
                for page in reader.pages:
                    p = page.extract_text()
                    if p:
                        text += p
                return text
        # Add more file type handlers as needed
        return "File content extracted successfully"
    except Exception as e:
        return f"Error extracting content: {str(e)}"

@app.route('/api/generate_reply', methods=['POST'])
def generate_reply():
    """Generate a friendly chat reply based on missing fields and the original input text.

    Expected JSON body:
      {
        "input_text": "...",
        "mandatory_empty_values": ["field1", "field2"],
        "one_of_empty_values": ["optA", "optB"]
      }

    Returns: { "chat_response": "..." }
    """
    try:
        global bedrock
        if bedrock is None:
            bedrock = aws.Bedrock()

        data = request.get_json(silent=True) or {}
        input_text = data.get('input_text', '')
        mandatory = data.get('mandatory_empty_values', data.get('mandatory', [])) or []
        one_of = data.get('one_of_empty_values', data.get('one_of', [])) or []

        # Coerce to lists of strings
        if not isinstance(mandatory, list):
            mandatory = [mandatory]
        if not isinstance(one_of, list):
            one_of = [one_of]
        mandatory = [str(x) for x in mandatory]
        one_of = [str(x) for x in one_of]

        app.logger.info(f"Generating chat reply for input_text (len={len(str(input_text))}) with mandatory={mandatory} one_of={one_of}")

        resp = bedrock.generate_reply(input_text=input_text, mandatory_empty_values=mandatory, one_of_empty_values=one_of)

        # bedrock.generate_reply returns a string on success or a dict with Error on failure
        if isinstance(resp, dict) and resp.get('Error'):
            return jsonify({'error': resp}), 500
        if not isinstance(resp, str):
            # If it returned something unexpected, stringify safely
            try:
                chat_text = str(resp)
            except Exception:
                chat_text = ""
        else:
            chat_text = resp

        return jsonify({'chat_response': chat_text}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile', methods=['GET'])
def get_profile():
    """Return the current user's profile JSON from S3 (user/{sub}.json).

    Requires Authorization: Bearer <id_token> header (Cognito ID token).
    If the profile does not exist, returns a default profile skeleton (ok: True, data: {...}).
    """
    token = request.headers.get('Authorization') or request.headers.get('X-Id-Token')
    if not token:
        return jsonify({'ok': False, 'error': 'Missing Authorization header'}), 401
    try:
        claims = auth.verify_cognito_jwt(token)
        sub = claims.get('sub') or claims.get('username') or claims.get('cognito:username')
        if not sub:
            return jsonify({'ok': False, 'error': 'Unable to determine user id from token'}), 400
        global s3
        if s3 is None:
            s3 = aws.S3()
        res = s3.load_user_profile(sub)
        if not res.get('ok'):
            # If profile not found, return a default skeleton so frontend can save it later
            if res.get('error') == 404 or str(res.get('error')) == '404':
                default_profile = {
                    'sub': sub,
                    'displayName': claims.get('name') or claims.get('email') or 'Learner',
                    'email': claims.get('email', ''),
                    'ownedDatasets': [],
                    'sharedDatasets': [],
                    'sharedWith': []
                }
                return jsonify({'ok': True, 'data': default_profile, 'key': None}), 200
            return jsonify({'ok': False, 'error': res.get('error')}), 500
        return jsonify({'ok': True, 'data': res.get('data'), 'key': res.get('key'), 'bucket': res.get('bucket')}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 401


@app.route('/api/profile', methods=['POST'])
def save_profile():
    """Save the user's profile JSON to S3 under user/{sub}.json.

    Requires Authorization: Bearer <id_token> header (Cognito ID token).
    Expects JSON body containing profile fields. The server will enforce `sub` from the token.
    """
    token = request.headers.get('Authorization') or request.headers.get('X-Id-Token')
    if not token:
        return jsonify({'ok': False, 'error': 'Missing Authorization header'}), 401
    try:
        claims = auth.verify_cognito_jwt(token)
        sub = claims.get('sub') or claims.get('username') or claims.get('cognito:username')
        if not sub:
            return jsonify({'ok': False, 'error': 'Unable to determine user id from token'}), 400
        payload = request.get_json(silent=True) or {}
        # Ensure the profile's sub is the authenticated subject
        payload['sub'] = sub
        # If email/displayName missing, default from token
        if not payload.get('displayName'):
            payload['displayName'] = claims.get('name') or claims.get('email') or 'Learner'
        if not payload.get('email'):
            payload['email'] = claims.get('email', '')

        global s3
        if s3 is None:
            s3 = aws.S3()
        res = s3.save_user_profile(sub, payload)
        if not res.get('ok'):
            return jsonify({'ok': False, 'error': res.get('error')}), 500
        return jsonify({'ok': True, 'key': res.get('key'), 'bucket': res.get('bucket')}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 401

if __name__ == '__main__':
    # Development server
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 6767))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    #app.run(host=host, port=port, debug=debug)
    app.run(host='0.0.0.0', port=int(os.getenv('FLASK_PORT', 6767)), debug=True)

@app.route('/api/join_game', methods=['POST'])
def join_game_api():
    """
    Join a game session. Expects X-Key (sessionID) and X-Player-Name headers.
    Calls dynamo.join_game(sessionID, playerName).
    Returns JSON response with player data or error.
    """
    global dynamo
    if dynamo is None:
        dynamo = aws.DynamoDB()
    session_id = request.headers.get('X-Key')
    player_name = request.headers.get('X-Player-Name')
    if not session_id or not player_name:
        return jsonify({'ok': False, 'error': 'Missing X-Key or X-Player-Name header'}), 400
    try:
        player_data = dynamo.join_game(session_id, player_name)
        return jsonify({'ok': True, 'player': player_data}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500