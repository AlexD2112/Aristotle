import boto3
import io
import os
import json
import random
import string
import uuid
from botocore.exceptions import ClientError
from dotenv import load_dotenv, find_dotenv

AWS_REGION = "us-east-1"

dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"Loaded .env from: {dotenv_path}")
else:
    print("No .env file found (falling back to shell environment / instance role)")

def save_to_s3(data: any, filename: str = None, bucket_name: str = None, key: str = None):
    """Save JSON-serializable `data` to S3.

    Parameters:
      - data: object to save (will be json.dumps)
      - filename: optional friendly filename to include in ContentDisposition and metadata
      - bucket_name: optional S3 bucket (falls back to QUESTIONBANK_BUCKET env or default)
      - key: optional explicit S3 key. If not provided one will be generated under questionbank/

    Returns: { ok: True, key: <s3-key>, bucket: <bucket> } or { ok: False, error: msg }
    """
    try:
        bucket = bucket_name or os.getenv('QUESTIONBANK_BUCKET', 'questionbankaristotle')
        json_text = json.dumps(data, ensure_ascii=False, indent=2)
        s3_client = boto3.client('s3', region_name=AWS_REGION)

        if not key:
            # Use a readable prefix and a uuid4-based filename for easy lookup and low chance of collision
            key = f"questionbank/questions-{uuid.uuid4().hex}.json"

        # Provide a ContentDisposition so browsers download a friendly filename when appropriate
        content_disposition = None
        if filename:
            # sanitize filename minimally
            safe_fn = ''.join(c for c in filename if c.isalnum() or c in (' ', '.', '-', '_')).strip()
            content_disposition = f'attachment; filename="{safe_fn}"'

        put_args = {
            'Bucket': bucket,
            'Key': key,
            'Body': json_text.encode('utf-8'),
            'ContentType': 'application/json'
        }
        if content_disposition:
            put_args['ContentDisposition'] = content_disposition

        s3_client.put_object(**put_args)
        return {'ok': True, 'key': key, 'bucket': bucket}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

class Bedrock:

    def __init__(self):
        load_dotenv()
        self.model_id = "amazon.nova-micro-v1:0"
        # Create a Bedrock Runtime client in the AWS Region of your choice.
        self.client = boto3.client("bedrock-runtime", region_name=AWS_REGION)

    def generate_desc(self, prompt=""):
        body = {
            "inferenceConfig" : {
                "maxTokens": 512,
                "temperature": 0.5,
                "topP": 0.9
            },
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": f"Generate a short, one-sentence description of the following topic: {prompt}"}],
                }
            ],
        }
        try:
            response = self.client.invoke_model(modelId=self.model_id, body=json.dumps(body))
            # Decode the response body.
            model_response = json.loads(response["body"].read())

            # Extract and print the response text.
            text = model_response["output"]["message"]["content"][0]["text"]
            return text
        except (ClientError, Exception) as e:
            print(e)
            # Surface full exception information for debugging
            resp = getattr(e, 'response', None)
            print("Bedrock invoke failed:")
            try:
                print(resp)
            except Exception:
                print(str(e))
            return prompt


    def generate_mcq(self, num_questions : int, input_file= "", prompt = ""):
        

        file_text = ''
        if input_file != "":
            with open(input_file, "r", encoding="utf-8") as f:
                file_text = f.read()
        
        prompt = f"""Based on the {'given prompt' if input_file == '' else 'uploaded lecture material'}, generate {num_questions} questions in this JSON format:
        {{
        "type": "multiple-choice",
        "question": "The correct answer is C.",
        "options": ["A: Option A", "B: Option B", "C: Option C", "D: Option D"],
        "answer": [2],
        "explanation": "The correct answer is C because …"
        }}
        The "answer" field should correspond to the index (or indices) in the options array that corresponds to the right answer
        Ensure that your response is in correct JSON format (INCLUDE NO EXTRA TEXT) as your output will be fed directly into code.
        {prompt if input_file == "" else file_text}
        """


        body = {
            "inferenceConfig" : {
                "maxTokens": 10000,
                "temperature": 0.5,
                "topP": 0.9
            },
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ],
        }


        # Convert the native request to JSON.
        request = json.dumps(body)

        try:
            # Invoke the model with the request.
            print(f"Invoking model {self.model_id} with body length={len(request)}")
            response = self.client.invoke_model(modelId=self.model_id, body=request)

        except (ClientError, Exception) as e:
            
            # Surface full exception information for debugging
            resp = getattr(e, 'response', None)
            print("Bedrock invoke failed:")
            try:
                print(resp)
            except Exception:
                print(str(e))
            # If user explicitly requests mock, or we hit known Bedrock errors, return a mock response
            mock_flag = os.getenv('MOCK_BEDROCK', '').lower() in ('1', 'true', 'yes')
            err_code = None
            if resp and isinstance(resp, dict) and 'Error' in resp:
                err_code = resp['Error'].get('Code')

            if mock_flag or err_code in ('ValidationException', 'InvalidSignatureException'):
                # Return a deterministic mock MCQ list (same shape as real model output text)
                mock_questions = [
                    {
                        "type": "multiple-choice",
                        "question": "What is 2 + 2?",
                        "options": ["A: 1", "B: 2", "C: 3", "D: 4"],
                        "answer": [3],
                        "explanation": "2 + 2 equals 4."
                    }
                ]
                return {"output": mock_questions}

            # Return a structured error so callers can see details
            return {'Error': resp.get('Error') if resp and isinstance(resp, dict) and 'Error' in resp else {'Message': str(e), 'Code': getattr(e, 'code', None)}, 'ResponseMetadata': resp.get('ResponseMetadata') if resp and isinstance(resp, dict) and 'ResponseMetadata' in resp else None, 'message': str(e)}

        # Decode the response body.
        model_response = json.loads(response["body"].read())

        # Extract and print the response text.
        text = model_response["output"]["message"]["content"][0]["text"]

        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return {"questions": parsed}
            if isinstance(parsed, dict) and parsed.get("questions"):
                return {"questions": parsed["questions"]}
            # if dict but not the expected shape, return it as-is
            return parsed
        except Exception:
            # fallback: return raw text (client can handle it) or split into lines
            return {"raw": text}
        


def main():
    bedrock = Bedrock()
    #n = int(input("Enter the number of questions you want to use: "))
    #print(bedrock.generate_mcq(n, input_file="Lecture_notes.txt"))
    print(bedrock.generate_desc("Cookies"))

if __name__ == "__main__":
    main()