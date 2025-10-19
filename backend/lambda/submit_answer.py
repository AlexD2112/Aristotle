import os, json, datetime, boto3

DDB = boto3.client("dynamodb")
TABLE = "QUIZ"

def handler(event, context):
    # AppSync resolver event
    args = event["arguments"]
    identity = event.get("identity", {})  # Cognito user
    username = identity.get("username") or identity.get("sub") or "anon"

    game_id = args["gameId"]
    q_index = int(args["qIndex"])
    selected = args.get("selected", [])
    # normalize to list[int]
    selected = [int(x) for x in selected]

    # 1) read question to get the correct answer
    q_key = {"pk": {"S": f"GAME#{game_id}"}, "sk": {"S": f"QUESTION#{q_index}"}}
    q_resp = DDB.get_item(TableName=TABLE, Key=q_key)
    q_item = q_resp.get("Item", {})
    if not q_item:
        return _err(400, "Question not found")

    # stored answer: a list of numeric indices
    correct_attr = q_item.get("answer")
    correct = []
    if correct_attr and "L" in correct_attr:
        for v in correct_attr["L"]:
            correct.append(int(v.get("N")))

    is_correct = (selected == correct)

    # 2) write ANSWER row conditionally + optionally update score atomically
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    answer_sk = f"ANSWER#{q_index}#{username}"

    tx_items = [{
        "Put": {
            "TableName": TABLE,
            "Item": {
                "pk": {"S": f"GAME#{game_id}"},
                "sk": {"S": answer_sk},
                "entity": {"S": "ANSWER"},
                "gameId": {"S": game_id},
                "qIndex": {"N": str(q_index)},
                "playerId": {"S": username},
                "selected": {"L": [{"N": str(i)} for i in selected]},
                "isCorrect": {"BOOL": is_correct},
                "submittedAt": {"S": now_iso}
            },
            "ConditionExpression": "attribute_not_exists(pk)"
        }
    }]

    if is_correct:
        tx_items.append({
            "Update": {
                "TableName": TABLE,
                "Key": {
                    "pk": {"S": f"GAME#{game_id}"},
                    "sk": {"S": f"PLAYER#{username}"}
                },
                "UpdateExpression": "ADD #s :inc",
                "ExpressionAttributeNames": {"#s": "score"},
                "ExpressionAttributeValues": {":inc": {"N": "10"}}
            }
        })

    try:
        DDB.transact_write_items(TransactItems=tx_items)
    except DDB.exceptions.TransactionCanceledException as e:
        # likely duplicate answer
        pass

    # 3) read back new score
    p_resp = DDB.get_item(
        TableName=TABLE,
        Key={"pk": {"S": f"GAME#{game_id}"}, "sk": {"S": f"PLAYER#{username}"}}
    )
    new_score = 0
    if "Item" in p_resp and "score" in p_resp["Item"]:
        new_score = int(p_resp["Item"]["score"]["N"])

    return {
        "gameId": game_id,
        "playerId": username,
        "qIndex": q_index,
        "isCorrect": is_correct,
        "newScore": new_score
    }

def _err(code, msg):
    raise Exception(json.dumps({"statusCode": code, "message": msg}))
