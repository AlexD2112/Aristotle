import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import boto3
from botocore.exceptions import BotoCoreError, ClientError

load_dotenv()

app = Flask(__name__)
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

if __name__ == '__main__':
    # Development server
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    app.run(host=host, port=port, debug=debug)
