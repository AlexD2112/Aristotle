import boto3
import os
import json
import uuid
import time
from typing import Any, Optional
from botocore.exceptions import ClientError
from dotenv import load_dotenv, find_dotenv

AWS_REGION = "us-east-1"

dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"Loaded .env from: {dotenv_path}")
else:
    print("No .env file found (falling back to shell environment / instance role)")

class DynamoDB:
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
        self.table = self.dynamodb.Table("QuizSessions")

    def put_session(self, session_data: dict) -> dict:
        try:
            response = self.table.put_item(
                Item=session_data
            )
            return {'ok': True, 'response': response}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    def get_session(self, session_id: str) -> dict:
        try:
            response = self.table.get_item(
                Key={'id': {'S': session_id}}
            )
            if 'Item' in response:
                return {'ok': True, 'data': json.loads(response['Item']['data']['S'])}
            return {'ok': False, 'error': 'Session not found'}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

class S3:
    def __init__(self):
        self.s3_client = boto3.client('s3', region_name=AWS_REGION)

    def load_from_s3(self,id: str, bucket_name: str = None, ):
        try:
            if not isinstance(id, str):
                return {"ok": False, "error": "Invalid id parameter: must be a string"}
            bucket = bucket_name or os.getenv("QUESTIONBANK_BUCKET","questionbankaristotle")
            key = f"questionbank/questions-{id}.json"
            response = self.s3_client.get_object(Bucket=bucket, Key=key)
            data = json.loads(response['Body'].read().decode('utf-8'))
            return {"ok": True, "data": data}
        except Exception as e:
            if isinstance(e, self.s3_client.exceptions.NoSuchKey):
                return {"ok": False, "error": 404}
            return {"ok": False, "error": e}

    def save_to_s3(self, data: any, filename: str = None, bucket_name: str = None, key: str = None):
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

            self.s3_client.put_object(**put_args)
            return {'ok': True, 'key': key, 'bucket': bucket}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    # New helpers for user profile objects saved under `user/{sub}.json`
    def load_user_profile(self, sub: str, bucket_name: str = None):
        try:
            if not sub:
                return {'ok': False, 'error': 'Missing subject id'}
            bucket = bucket_name or os.getenv('QUESTIONBANK_BUCKET', 'questionbankaristotle')
            key = f"user/{sub}.json"
            response = self.s3_client.get_object(Bucket=bucket, Key=key)
            data = json.loads(response['Body'].read().decode('utf-8'))
            return {'ok': True, 'data': data, 'key': key, 'bucket': bucket}
        except Exception as e:
            # AWS raises a ClientError for missing key; detect and return 404 for frontend convenience
            if isinstance(e, ClientError) and e.response.get('Error', {}).get('Code') == 'NoSuchKey':
                return {'ok': False, 'error': 404}
            return {'ok': False, 'error': str(e)}

    def save_user_profile(self, sub: str, data: any, bucket_name: str = None):
        try:
            if not sub:
                return {'ok': False, 'error': 'Missing subject id'}
            bucket = bucket_name or os.getenv('QUESTIONBANK_BUCKET', 'questionbankaristotle')
            key = f"user/{sub}.json"
            json_text = json.dumps(data, ensure_ascii=False, indent=2)
            self.s3_client.put_object(Bucket=bucket, Key=key, Body=json_text.encode('utf-8'), ContentType='application/json')
            return {'ok': True, 'key': key, 'bucket': bucket}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    def find_sub_by_stripe_customer(self, stripe_customer_id: str, bucket_name: str = None):
        """Find a user 'sub' by their stored stripe_customer_id in user/{sub}.json files.

        This performs a shallow scan of user/ objects in the configured bucket and returns the
        first matching subject (sub) or None if not found. This is intended for small-scale
        user counts or dev usage. For production, add an index (DynamoDB) mapping customers.
        """
        try:
            if not stripe_customer_id:
                return None
            bucket = bucket_name or os.getenv('QUESTIONBANK_BUCKET', 'questionbankaristotle')
            paginator = self.s3_client.get_paginator('list_objects_v2')
            prefix = 'user/'
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                for obj in page.get('Contents', []) or []:
                    key = obj.get('Key')
                    # Expect keys like user/{sub}.json
                    if not key or not key.startswith(prefix):
                        continue
                    try:
                        resp = self.s3_client.get_object(Bucket=bucket, Key=key)
                        body = resp['Body'].read().decode('utf-8')
                        data = json.loads(body)
                        if isinstance(data, dict) and data.get('stripe_customer_id') == stripe_customer_id:
                            # Extract sub from filename or payload
                            sub = data.get('sub')
                            if not sub:
                                # derive from key user/{sub}.json
                                fname = key.split('/')[-1]
                                if fname.endswith('.json'):
                                    sub = fname[:-5]
                            return sub
                    except Exception:
                        # ignore individual read errors and continue scanning
                        continue
            return None
        except Exception as e:
            return None

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

    def generate_reply(self, input_text: str, mandatory_empty_values: list, one_of_empty_values: list):
        # Paired with parse_response, this generates a reply prompt based on missing output values and the input text.
        # Goal is to be friendly and helpful and respond, but keep in mind that before generating all mandatory_empty_values need to be filled
        # and at least one of the one_of_empty_values needs to be filled.
        prompt = f"""Based on the following input text, please respond in a friendly and helpful answer to the user.
        Input Text from User: {input_text}
        The following fields are missing and need to be filled in by them in a future message:
        Mandatory fields: {', '.join(mandatory_empty_values) if len(mandatory_empty_values) > 0 else 'None'}
        Optional fields (at least one required): {', '.join(one_of_empty_values) if len(one_of_empty_values) > 0 else 'None'}
        Please respond in a way that encourages the user to provide the missing information, while acting friendly, helpful and human. 
        Only ask the user if they are ready for generation (generate_now) if theres no other issues (no other missing mandatory values, and at least one optional value is present), Otherwise, DO NOT MENTION ANYTHING ABOUT generate_now
        Do not tell the user what the mandatory and optional fields are in a list format! Merely conversationally indicate what is necesary in an intuitive manner.
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
        try:
            # Invoke the model with the request.
            print(f"Invoking model {self.model_id} with body length={len(json.dumps(body))}")
            response = self.client.invoke_model(modelId=self.model_id, body=json.dumps(body))
        except (ClientError, Exception) as e:
            # Surface full exception information for debugging
            resp = getattr(e, 'response', None)
            print("Bedrock invoke failed:")
            try:
                print(resp)
            except Exception:
                print(str(e))
            # Return a structured error so callers can see details
            return {'Error': resp.get('Error') if resp and isinstance(resp, dict) and 'Error' in resp else {'Message': str(e), 'Code': getattr(e, 'code', None)}, 'ResponseMetadata': resp.get('ResponseMetadata') if resp and isinstance(resp, dict) and 'ResponseMetadata' in resp else None, 'message': str(e)}
        # Decode the response body.
        model_response = json.loads(response["body"].read())
        # Extract and print the response text.
        text = model_response["output"]["message"]["content"][0]["text"]
        return text


    #Parse response. Takes self, an input block of text, and an array of arrays. Each element in the
    #Array is a triple containing a name, a description, and a type of each expected return val
    #Returns a json parsed with nova-micro of the response
    def parse_response(self, input_text: str, expected_output: list):
        # Build field specs and a human-friendly fields description
        field_specs = []
        for item in expected_output:
            if not isinstance(item, (list, tuple)) or len(item) < 1:
                continue
            name = item[0]
            # len >= 3: (name, desc, type), else try to infer or default to string
            type_ = item[2] if len(item) > 2 else (item[1] if len(item) > 1 else "string")
            field_specs.append((name, str(type_).lower()))

        fields_desc = ', '.join([f"{n} ({t})" for n, t in field_specs])

        prompt = (
            f"Based on the following input text, extract the relevant information and return it in JSON format "
            f"with the following fields: {fields_desc}.\n\n"
            f"Important requirements:\n"
            f"- Include every field listed above as a top-level key in the JSON output.\n"
            f"- If you cannot determine a value for a field, use the most relevant null-like value for its type "
            f"(for example: empty string for text, empty array for lists, empty object for objects, or JSON null for numbers/booleans).\n"
            f"- Do NOT include any additional keys — the output must contain only the fields listed above.\n"
            f"- Even if it seems properly positioned, the response must be a full representation of the value- tend towards leaving null if you have malformed/shitty/not enough info for values.\n"
            f"- Output must be valid JSON and contain ONLY the JSON object (no explanatory text).\n\n"
            f"Input Text from User: {input_text}\n"
        )

        body = {
            "inferenceConfig": {"maxTokens": 10000, "temperature": 0.5, "topP": 0.9},
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
        }

        request = json.dumps(body)
        try:
            print(f"Invoking model {self.model_id} with body length={len(request)}")
            response = self.client.invoke_model(modelId=self.model_id, body=request)
        except (ClientError, Exception) as e:
            resp = getattr(e, "response", None)
            print("Bedrock invoke failed:")
            try:
                print(resp)
            except Exception:
                print(str(e))
            return {"Error": resp.get("Error") if resp and isinstance(resp, dict) and "Error" in resp else {"Message": str(e), "Code": getattr(e, "code", None)}, "ResponseMetadata": resp.get("ResponseMetadata") if resp and isinstance(resp, dict) and "ResponseMetadata" in resp else None, "message": str(e)}

        model_response = json.loads(response["body"].read())
        text = model_response["output"]["message"]["content"][0]["text"]

        def default_for_type(type_str: str):
            t = type_str.lower()
            if "array" in t or "list" in t or t.endswith("[]"):
                return []
            if t in ("object", "dict", "map"):
                return {}
            if t in ("int", "integer", "number", "float", "double", "numeric"):
                return None
            if t in ("bool", "boolean"):
                return None
            # fallback to empty string for text-like types
            return ""

        try:
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                # keep the raw output so frontend can inspect; don't fabricate fields
                return {"raw": text}

            # Build result only with expected fields, applying type-appropriate defaults when missing/null
            result = {}
            for name, type_ in field_specs:
                if name in parsed and parsed[name] is not None:
                    result[name] = parsed[name]
                else:
                    result[name] = default_for_type(type_)

            return result
        except Exception:
            # Fallback: return raw text so caller can inspect
            return {"raw": text}


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