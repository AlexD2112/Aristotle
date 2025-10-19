import boto3
import io
import os
import json
from botocore.exceptions import ClientError
from dotenv import load_dotenv, find_dotenv

AWS_REGION = "us-east-1"

dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"Loaded .env from: {dotenv_path}")
else:
    print("No .env file found (falling back to shell environment / instance role)")

def save_to_s3(data: any, key: str,):
    try:
        jsonFile = json.dumps(data)
        s3_client = boto3.client("s3",region_name=AWS_REGION)
        body = io.BytesIO(jsonFile.encode("utf-8"))
        s3_client.put_object(Bucket="question-bank-aristotle", Key=key, Body=body.getvalue())
        return {"ok": True, "key": key}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def generate_mcq(num_questions : int, input_file= "", prompt = ""):
    load_dotenv()
    # Create a Bedrock Runtime client in the AWS Region of your choice.
    client = boto3.client("bedrock-runtime", region_name=AWS_REGION)

    model_id = "amazon.nova-micro-v1:0"

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
            "maxTokens": 2048,
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
        print(f"Invoking model {model_id} with body length={len(request)}")
        response = client.invoke_model(modelId=model_id, body=request)

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
    return model_response["output"]["message"]["content"][0]["text"]
    


def main():
    n = int(input("Enter the number of questions you want to use: "))
    print(generate_mcq(n, input_file="Lecture_notes.txt"))

if __name__ == "__main__":
    main()