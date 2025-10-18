import boto3
import io
import os
import json
from botocore.exceptions import ClientError
from dotenv import load_dotenv

AWS_REGION = "us-east-1"

def save_to_s3(data: any, key: str,):
    try:
        jsonFile = json.dumps(data)
        s3_client = boto3.client("s3",region_name=AWS_REGION)
        body = io.BytesIO(jsonFile.encode("utf-8"))
        s3_client.put_object(Bucket="question-bank-aristotle", Key=key, Body=body.getvalue())
    except Exception as e:
        return f"ERROR: {e}"

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
        response = client.invoke_model(modelId=model_id, body=request)

    except (ClientError, Exception) as e:
        return e.response

    # Decode the response body.
    model_response = json.loads(response["body"].read())

    # Extract and print the response text.
    return model_response["output"]["message"]["content"][0]["text"]
    


def main():
    n = int(input("Enter the number of questions you want to use: "))
    print(generate_mcq(n, input_file="Lecture_notes.txt"))

if __name__ == "__main__":
    main()