import boto3
import json

# Crear cliente Lambda
lambda_client = boto3.client("lambda", region_name="us-east-1")

# Datos que quieres enviar a la lambda
payload = {
  "version": "2.0",
  "routeKey": "GET /tasks",
  "rawPath": "/tasks",
  "requestContext": {
    "http": {
      "method": "GET",
      "path": "/tasks",
      "protocol": "HTTP/1.1",
      "sourceIp": "127.0.0.1",
      "userAgent": "curl/8.5.0"
    }
  },
  "headers": {
    "authorization": "Bearer 06b09558-0dab-41e9-959d-7f0c7d046cbf",
    "host": "localhost:3000"
  },
  "isBase64Encoded": False,
  "queryStringParameters": None,
  "body": None
}


# Invocar la función
response = lambda_client.invoke(
    FunctionName="Ajolo-T",
    InvocationType="RequestResponse",  # También puede ser "Event"
    Payload=json.dumps(payload)
)

# Leer la respuesta
respuesta_json = json.loads(response["Payload"].read())
print(respuesta_json)