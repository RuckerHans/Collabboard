data "archive_file" "note_history_worker" {
  type        = "zip"
  source_dir  = "${path.module}/../../collabboard_api/lambda/note-history-worker"
  output_path = "${path.module}/builds/note-history-worker.zip"
  excludes    = ["function.zip", ".gitignore"]
}

resource "aws_cloudwatch_log_group" "note_history_worker" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-note-history-worker"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-${var.environment}-note-history-worker-logs"
  }
}

resource "aws_lambda_function" "note_history_worker" {
  function_name = "${var.project_name}-${var.environment}-note-history-worker"
  role          = aws_iam_role.note_history_worker.arn

  filename         = data.archive_file.note_history_worker.output_path
  source_code_hash = data.archive_file.note_history_worker.output_base64sha256

  handler = "index.handler"
  runtime = "nodejs20.x"

  timeout     = 30
  memory_size = 128

  environment {
    variables = {
      DB_CREDENTIALS_SECRET_ARN = aws_secretsmanager_secret.db_credentials.arn
      DB_SSL                    = "true"
    }
  }

  vpc_config {
    subnet_ids         = values(aws_subnet.private)[*].id
    security_group_ids = [aws_security_group.lambda_worker.id]
  }

  depends_on = [aws_cloudwatch_log_group.note_history_worker]

  tags = {
    Name = "${var.project_name}-${var.environment}-note-history-worker"
  }
}

resource "aws_lambda_event_source_mapping" "note_history_worker" {
  event_source_arn = aws_sqs_queue.note_history.arn
  function_name    = aws_lambda_function.note_history_worker.function_name
  batch_size       = 10

  function_response_types = ["ReportBatchItemFailures"]
}
