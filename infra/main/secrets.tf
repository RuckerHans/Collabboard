resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "collabboard/${var.environment}/db-credentials"
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-${var.environment}-db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username     = aws_db_instance.main.username
    password     = local.rds_master_password
    app_username = "collabboard_app"
    app_password = random_password.app_role.result
    host         = aws_db_instance.main.address
    port         = aws_db_instance.main.port
    dbname       = aws_db_instance.main.db_name
  })
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "collabboard/${var.environment}/redis-auth"
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-auth"
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id = aws_secretsmanager_secret.redis_auth.id
  secret_string = format(
    "rediss://default:%s@%s:6379",
    urlencode(random_password.redis_auth.result),
    aws_elasticache_replication_group.main.primary_endpoint_address,
  )
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "collabboard/${var.environment}/jwt-secret"
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-${var.environment}-jwt-secret"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}
