import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({
  region: "us-east-1"
});

async function llamarLambda() {
  const payload = {
  "Records": [
    {
      "cf": {
        "config": {
          "distributionId": "EXAMPLE"
        },
        "request": {
          "uri": "/test",
          "method": "GET",
          "clientIp": "2001:cdba::3257:9652",
          "headers": {
            "host": [
              {
                "key": "Host",
                "value": "d123.cf.net"
              }
            ]
          }
        }
      }
    }
  ]
};

  const command = new InvokeCommand({
    FunctionName: "Ajolo-T",
    InvocationType: "RequestResponse",
    Payload: Buffer.from(JSON.stringify(payload))
  });

  const response = await client.send(command);

  const respuestaJson = JSON.parse(new TextDecoder().decode(response.Payload));
  console.log("Respuesta Lambda:", respuestaJson);
}

llamarLambda();