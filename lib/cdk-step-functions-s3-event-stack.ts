import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as event from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CdkStepFunctionsS3EventStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sourceS3 = new s3.Bucket(this, "SourceS3Bucket", {
      eventBridgeEnabled: true,
    });

    const eventTable = new dynamodb.Table(this, "EventTable", {
      partitionKey: { name: "filePath", type: dynamodb.AttributeType.STRING },
    });

    const putItemJob = new tasks.DynamoPutItem(this, "PutItem", {
      item: {
        filePath: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.detail.object.key")
        ),
        event: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("States.JsonToString($)")
        ),
      },
      table: eventTable,
    });

    const definition = putItemJob;

    const logGroup = new logs.LogGroup(this, "StateMachineLogGroup");
    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definition,
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      timeout: cdk.Duration.minutes(5),
    });
    eventTable.grantWriteData(stateMachine);

    const eventRule = new event.Rule(this, "EventRule", {
      eventPattern: {
        source: ["aws.s3"],
        detail: {
          bucket: {
            name: [sourceS3.bucketName],
          },
        },
      },
    });
    eventRule.addTarget(new eventTargets.SfnStateMachine(stateMachine));
  }
}
