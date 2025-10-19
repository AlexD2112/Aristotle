from aws_cdk import (
    Stack,
    RemovalPolicy,
    Duration,
    aws_dynamodb as ddb,
    aws_cognito as cognito,
    aws_appsync as appsync,
    aws_lambda as _lambda,
    aws_iam as iam,
)
from constructs import Construct
import os

class QuizRealtimeStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # DynamoDB table (use existing name if you already created one)
        table = ddb.Table(
            self, "QuizTable",
            table_name="Quiz",
            partition_key=ddb.Attribute(name="pk", type=ddb.AttributeType.STRING),
            sort_key=ddb.Attribute(name="sk", type=ddb.AttributeType.STRING),
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY # dev only; change in prod
        )

        # Cognito user pool
        user_pool = cognito.UserPool(self, "QuizUsers",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(username=True, email=True)
        )
        user_pool_client = cognito.UserPoolClient(self, "QuizUserClient",
            user_pool=user_pool,
            generate_secret=False
        )

        # AppSync API
        api = appsync.GraphqlApi(
            self, "QuizApi",
            name="quiz-realtime-api",
            schema=appsync.SchemaFile.from_asset("schema.graphql"),
            authorization_config=appsync.AuthorizationConfig(
                default_authorization=appsync.AuthorizationMode(
                    authorization_type=appsync.AuthorizationType.USER_POOL,
                    user_pool_config=appsync.UserPoolConfig(user_pool=user_pool)
                ),
                additional_authorization_modes=[
                    appsync.AuthorizationMode(authorization_type=appsync.AuthorizationType.IAM) # for backend access
                ]
            ),
            xray_enabled=True
        )

        # Data sources
        ddb_ds = api.add_dynamo_db_data_source("QuizDynamoDS", table)

        submit_fn = _lambda.Function(
            self, "SubmitAnswerFn",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="submit_answer.handler",
            code=_lambda.Code.from_asset("lambda"),
            environment={"TABLE_NAME": table.table_name},
            timeout=Duration.seconds(10)
        )
        table.grant_read_write_data(submit_fn)

        lambda_ds = api.add_lambda_data_source("SubmitAnswerDS", submit_fn)

        # ---- Resolvers (VTL for simplicity) ----

        # 1) createGame -> PutItem
        ddb_ds.create_resolver(
            type_name="Mutation",
            field_name="createGame",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
#set($gameId = $util.autoId())
#set($now = $util.time.nowISO8601())
#set($hostId = $ctx.identity.username)
#set($sec = $util.defaultIfNull($ctx.args.secondsPerQuestion, 20))
{
  "version": "2018-05-29",
  "operation": "PutItem",
  "key": {
    "pk":   $util.dynamodb.toDynamoDBJson("GAME#$gameId"),
    "sk":   $util.dynamodb.toDynamoDBJson("GAME#$gameId")
  },
  "attributeValues": {
    "entity":   $util.dynamodb.toDynamoDBJson("GAME"),
    "status":   $util.dynamodb.toDynamoDBJson("LOBBY"),
    "hostId":   $util.dynamodb.toDynamoDBJson("$hostId"),
    "currentQ": $util.dynamodb.toDynamoDBJson(0),
    "createdAt":$util.dynamodb.toDynamoDBJson("$now"),
    "settings": $util.dynamodb.toDynamoDBJson({"secondsPerQuestion": $sec})
  },
  "condition": {
    "expression": "attribute_not_exists(#pk)",
    "expressionNames": { "#pk": "pk" }
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.from_string(r"""
$util.toJson({
  "gameId": "$gameId",
  "status": "LOBBY",
  "hostId": "$ctx.identity.username",
  "currentQ": 0,
  "createdAt": "$now",
  "settings": { "secondsPerQuestion": $sec }
})
""")
        )

        # 2) joinGame -> PutItem (guard on SK)
        ddb_ds.create_resolver(
            type_name="Mutation",
            field_name="joinGame",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
#set($now = $util.time.nowISO8601())
#set($playerId = $ctx.identity.username)
{
  "version": "2018-05-29",
  "operation": "PutItem",
  "key": {
    "pk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId"),
    "sk": $util.dynamodb.toDynamoDBJson("PLAYER#$playerId")
  },
  "attributeValues": {
    "entity":   $util.dynamodb.toDynamoDBJson("PLAYER"),
    "gameId":   $util.dynamodb.toDynamoDBJson("$ctx.args.gameId"),
    "playerId": $util.dynamodb.toDynamoDBJson("$playerId"),
    "name":     $util.dynamodb.toDynamoDBJson("$ctx.args.name"),
    "score":    $util.dynamodb.toDynamoDBJson(0),
    "joinedAt": $util.dynamodb.toDynamoDBJson("$now")
  },
  "condition": {
    "expression": "attribute_not_exists(#sk)",
    "expressionNames": { "#sk": "sk" }
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.from_string(r"""
$util.toJson({
  "gameId": "$ctx.args.gameId",
  "playerId": "$ctx.identity.username",
  "name": "$ctx.args.name",
  "score": 0,
  "joinedAt": "$util.time.nowISO8601()"
})
""")
        )

        # 3) startGame -> UpdateItem (LOBBY -> IN_PROGRESS)
        ddb_ds.create_resolver(
            type_name="Mutation",
            field_name="startGame",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
{
  "version": "2018-05-29",
  "operation": "UpdateItem",
  "key": {
    "pk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId"),
    "sk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId")
  },
  "update": {
    "expression": "SET #st = :inprog",
    "expressionNames": { "#st": "status" },
    "expressionValues": { ":inprog": $util.dynamodb.toDynamoDBJson("IN_PROGRESS") }
  },
  "condition": {
    "expression": "#st = :lobby",
    "expressionNames": { "#st": "status" },
    "expressionValues": { ":lobby": $util.dynamodb.toDynamoDBJson("LOBBY") }
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.dynamo_db_result_item()
        )

        # 4) nextQuestion -> UpdateItem (currentQ + 1 if IN_PROGRESS)
        ddb_ds.create_resolver(
            type_name="Mutation",
            field_name="nextQuestion",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
{
  "version": "2018-05-29",
  "operation": "UpdateItem",
  "key": {
    "pk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId"),
    "sk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId")
  },
  "update": {
    "expression": "SET currentQ = currentQ + :one",
    "expressionValues": { ":one": $util.dynamodb.toDynamoDBJson(1) }
  },
  "condition": {
    "expression": "#st = :inprog",
    "expressionNames": { "#st": "status" },
    "expressionValues": { ":inprog": $util.dynamodb.toDynamoDBJson("IN_PROGRESS") }
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.dynamo_db_result_item()
        )

        # 5) endGame -> UpdateItem
        ddb_ds.create_resolver(
            type_name="Mutation",
            field_name="endGame",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
{
  "version": "2018-05-29",
  "operation": "UpdateItem",
  "key": {
    "pk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId"),
    "sk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId")
  },
  "update": {
    "expression": "SET #st = :ended",
    "expressionNames": { "#st": "status" },
    "expressionValues": { ":ended": $util.dynamodb.toDynamoDBJson("ENDED") }
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.dynamo_db_result_item()
        )

        # 6) Queries
        # getGame -> GetItem
        ddb_ds.create_resolver(
            type_name="Query",
            field_name="getGame",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "pk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId"),
    "sk": $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId")
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.dynamo_db_result_item()
        )

        # listPlayers -> Query begins_with(PLAYER#)
        ddb_ds.create_resolver(
            type_name="Query",
            field_name="listPlayers",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
{
  "version": "2018-05-29",
  "operation": "Query",
  "query": {
    "expression": "#pk = :vpk AND begins_with(#sk, :prefix)",
    "expressionNames": { "#pk": "pk", "#sk": "sk" },
    "expressionValues": {
      ":vpk":    $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId"),
      ":prefix": $util.dynamodb.toDynamoDBJson("PLAYER#")
    }
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.dynamo_db_result_list()
        )

        # listQuestions -> Query begins_with(QUESTION#) (answers are stored but not returned in schema)
        ddb_ds.create_resolver(
            type_name="Query",
            field_name="listQuestions",
            request_mapping_template=appsync.MappingTemplate.from_string(r"""
{
  "version": "2018-05-29",
  "operation": "Query",
  "query": {
    "expression": "#pk = :vpk AND begins_with(#sk, :prefix)",
    "expressionNames": { "#pk": "pk", "#sk": "sk" },
    "expressionValues": {
      ":vpk":    $util.dynamodb.toDynamoDBJson("GAME#$ctx.args.gameId"),
      ":prefix": $util.dynamodb.toDynamoDBJson("QUESTION#")
    }
  }
}
"""),
            response_mapping_template=appsync.MappingTemplate.dynamo_db_result_list()
        )

        # 7) submitAnswer -> Lambda resolver
        lambda_ds.create_resolver(
            type_name="Mutation",
            field_name="submitAnswer"
        )

        # Minimal policy so AppSync (IAM auth) can read/write the table if you want backend IAM callers
        table.grant_read_write_data(api.grant_principal)
