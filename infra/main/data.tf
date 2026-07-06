locals {
  rds_master_password = random_password.rds_master.result
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db"
  subnet_ids = values(aws_subnet.private)[*].id

  tags = {
    Name = "${var.project_name}-${var.environment}-db-subnet-group"
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-redis"
  subnet_ids = values(aws_subnet.private)[*].id

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-subnet-group"
  }
}

resource "random_password" "rds_master" {
  length  = 24
  special = false
}

resource "random_password" "app_role" {
  length  = 24
  special = false
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-${var.environment}-postgres"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "collabboard"
  username = "collabboard"
  password = local.rds_master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 1

  # This portfolio environment favors inexpensive, clean teardown. A real
  # production database should normally retain a final snapshot on deletion.
  skip_final_snapshot = true
  deletion_protection = false
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "Redis for ${var.project_name} ${var.environment}"

  engine             = "redis"
  engine_version     = var.redis_engine_version
  node_type          = var.redis_node_type
  num_cache_clusters = 1
  port               = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = false
  multi_az_enabled           = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result
}
