import aws
import boto3
import io
import os
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv, find_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS


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
        num_questions = int(request.headers.get("X-Num-Questions"))
        topic = request.headers.get("X-Topic")
        return jsonify(aws.generate_mcq(num_questions,prompt=topic)), 200
    # This code is unsafe, remove for prod
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/save", methods=["POST"])
def save():
    try:
        key = request.headers.get("X-Key")
        data = request.get_json()
        aws.save_to_s3(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Development server
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 6767))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    app.run(host=host, port=port, debug=debug)

