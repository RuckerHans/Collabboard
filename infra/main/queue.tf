resource "aws_sqs_queue" "note_history_dlq" {
  name                      = "${var.project_name}-${var.environment}-note-history-dlq"
  message_retention_seconds = 1209600

  tags = {
    Name = "${var.project_name}-${var.environment}-note-history-dlq"
  }
}

resource "aws_sqs_queue" "note_history" {
  name                       = "${var.project_name}-${var.environment}-note-history"
  message_retention_seconds  = 345600
  visibility_timeout_seconds = 30

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.note_history_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-note-history"
  }
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "note_history_worker" {
  name               = "collabboard-note-history-worker-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "note_history_worker_basic_execution" {
  role       = aws_iam_role.note_history_worker.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "note_history_worker_vpc_access" {
  role       = aws_iam_role.note_history_worker.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "note_history_worker_sqs" {
  statement {
    sid    = "ReadNoteHistoryQueue"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.note_history.arn]
  }
}

resource "aws_iam_role_policy" "note_history_worker_sqs" {
  name   = "collabboard-note-history-worker-sqs"
  role   = aws_iam_role.note_history_worker.id
  policy = data.aws_iam_policy_document.note_history_worker_sqs.json
}

data "aws_iam_policy_document" "note_history_worker_db_credentials" {
  statement {
    sid       = "ReadDatabaseCredentials"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_credentials.arn]
  }
}

resource "aws_iam_role_policy" "note_history_worker_db_credentials" {
  name   = "collabboard-note-history-worker-db-credentials"
  role   = aws_iam_role.note_history_worker.id
  policy = data.aws_iam_policy_document.note_history_worker_db_credentials.json
}
