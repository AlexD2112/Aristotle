from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_aws import ChatBedrock
import boto3
import os
import json

from botocore.exceptions import ClientError

os.environ["AWS_PROFILE"] = "TuoNiTony"

# Create a Bedrock Runtime client in the AWS Region of your choice.
client = boto3.client("bedrock-runtime", region_name="us-east-1")

# Set the model ID, e.g., Claude 3 Haiku.
model_id = "anthropic.claude-3-haiku-20240307-v1:0"

with open("Lecture_notes.txt", "r", encoding="utf-8") as f:
    file_text = f.read()
 
prompt = f"""Based on the uploaded lecture material, generate multiple questions in this JSON format:
{{
  "type": "multiple-choice",
  "question": "The correct answer is C.",
  "options": ["A", "B", "C", "D"],
  "answer": [2],
  "explanation": "The correct answer is C because …"
}}

{file_text}
"""


# prompt = f"Please summarize the following text:\n\n{file_text}"


native_request = {
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 512,
    "temperature": 0.5,
    "messages": [
        {
            "role": "user",
            "content": [{"type": "text", "text": prompt}],
        }
    ],
}


# Convert the native request to JSON.
request = json.dumps(native_request)

try:
    # Invoke the model with the request.
    response = client.invoke_model(modelId=model_id, body=request)

except (ClientError, Exception) as e:
    print(f"ERROR: Can't invoke '{model_id}'. Reason: {e}")
    exit(1)

# Decode the response body.
model_response = json.loads(response["body"].read())

# Extract and print the response text.
response_text = model_response["content"][0]["text"]
print(response_text)
