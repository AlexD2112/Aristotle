import boto3
import datetime
import uuid
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table = dynamodb.Table('Quiz')

def create_game(host_id: str, seconds_per_question=20):
    game_id = str(uuid.uuid4())
    item = {
        "pk": f"GAME#{game_id}",
        "sk": f"GAME#{game_id}",
        "entity": "GAME",
        "status": "LOBBY",
        "hostId": host_id,
        "currentQ": 0,
        "createdAt": datetime.datetime.utcnow().isoformat() + "Z",
        "settings": {"secondsPerQuestion": seconds_per_question}
    }
    table.put_item(Item=item)
    return game_id

def join_game(game_id: str, player_id: str, name: str):
    item = {
        "pk": f"GAME#{game_id}",
        "sk": f"PLAYER#{player_id}",
        "entity": "PLAYER",
        "playerId": player_id,
        "name": name,
        "score": 0,
        "joinedAt": datetime.datetime.utcnow().isoformat() + "Z"
    }
    table.put_item(
        Item=item,
        #ConditionExpression="attribute_not_exists(#sk)",
        #ExpressionAttributeNames={"#sk": "sk"}
    )
    return item


def list_players(game_id: str):
    resp = table.query(
        KeyConditionExpression=Key('pk').eq(f"GAME#{game_id}") & Key('sk').begins_with("PLAYER#")
    )
    return resp['Items']

def list_questions(game_id: str):
    resp = table.query(
        KeyConditionExpression=Key('pk').eq(f"GAME#{game_id}") & Key('sk').begins_with("QUESTION#")
    )
    return resp['Items']

def update_score(game_id: str, player_id: str, delta: int):
    """Atomically increment player score."""
    table.update_item(
        Key={'pk': f"GAME#{game_id}", 'sk': f"PLAYER#{player_id}"},
        UpdateExpression="ADD #s :inc",
        ExpressionAttributeNames={"#s": "score"},
        ExpressionAttributeValues={":inc": delta}
    )
