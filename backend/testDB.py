import os, json, requests, boto3
from dotenv import load_dotenv
load_dotenv()

APPSYNC_URL = os.getenv("APPSYNC_URL")
AUTH_MODE = os.getenv("AUTH_MODE", "API_KEY")
HEADERS = {"Content-Type": "application/json"}

# Get token depending on auth type
if AUTH_MODE == "API_KEY":
    HEADERS["x-api-key"] = os.getenv("API_KEY")

elif AUTH_MODE == "USER_POOL":
    # Authenticate with Cognito User Pool
    cognito = boto3.client("cognito-idp", region_name=os.getenv("AWS_REGION"))
    resp = cognito.initiate_auth(
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={
            "USERNAME": os.getenv("USERNAME"),
            "PASSWORD": os.getenv("PASSWORD")
        },
        ClientId=os.getenv("USER_POOL_CLIENT_ID")
    )
    token = resp["AuthenticationResult"]["IdToken"]
    HEADERS["Authorization"] = token

def gql(query, variables=None):
    body = {"query": query, "variables": variables or {}}
    r = requests.post(APPSYNC_URL, headers=HEADERS, data=json.dumps(body))
    print("Status:", r.status_code)
    print("Response:")
    print(json.dumps(r.json(), indent=2))
    return r.json()

# --- test mutation ---
create_game = """
mutation Create($sec:Int){
  createGame(secondsPerQuestion:$sec){
    gameId
    status
    hostId
    currentQ
    createdAt
  }
}
"""
gql(create_game, {"sec": 20})
