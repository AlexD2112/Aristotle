import aws
import boto3
import io
import os
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv, find_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import uuid
from werkzeug.utils import secure_filename


dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"Loaded .env from: {dotenv_path}")
else:
    print("No .env file found (falling back to shell environment / instance role)")

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

@app.route('/api/generate_mcq', methods=["GET"])
def generate_mcq():
    try:
        # Support POST with JSON body for better client semantics, fall back to headers for GET
        if request.method == 'POST' or request.is_json:
            data = request.get_json(silent=True) or {}
            num_questions = int(data.get('num_questions', data.get('numQuestions', 1)))
            topic = data.get('topic') or data.get('prompt')
        else:
            num_questions = int(request.headers.get("X-Num-Questions", 1))
            topic = request.headers.get("X-Topic")

        result = aws.generate_mcq(num_questions, prompt=topic)
        # If aws.generate_mcq returns an error dict, pass it through
        if isinstance(result, dict) and result.get('Error'):
            return jsonify(result), 500
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/save", methods=["POST"])
def save():
    try:
        data = request.get_json()
        return  aws.save_to_s3(data)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
            # You'll need to install PyPDF2: pip install PyPDF2
            import PyPDF2
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                text = ""
                for page in reader.pages:
                    text += page.extract_text()
                return text
        # Add more file type handlers as needed
        return "File content extracted successfully"
    except Exception as e:
        return f"Error extracting content: {str(e)}"

if __name__ == '__main__':
    # Development server
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 6767))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    app.run(host=host, port=port, debug=debug)