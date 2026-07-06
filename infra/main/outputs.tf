output "vpc_id" {
  description = "ID of the Collabboard VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets."
  value       = values(aws_subnet.public)[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets."
  value       = values(aws_subnet.private)[*].id
}

output "alb_sg_id" {
  description = "ID of the application load balancer security group."
  value       = aws_security_group.alb.id
}

output "api_sg_id" {
  description = "ID of the API security group."
  value       = aws_security_group.api.id
}

output "front_sg_id" {
  description = "ID of the frontend security group."
  value       = aws_security_group.front.id
}

output "rds_sg_id" {
  description = "ID of the RDS security group."
  value       = aws_security_group.rds.id
}

output "redis_sg_id" {
  description = "ID of the Redis security group."
  value       = aws_security_group.redis.id
}

output "rds_endpoint" {
  description = "RDS endpoint including the port."
  value       = aws_db_instance.main.endpoint
  sensitive   = false
}

output "rds_address" {
  description = "RDS hostname without the port."
  value       = aws_db_instance.main.address
  sensitive   = false
}

output "redis_endpoint" {
  description = "Primary Redis endpoint hostname."
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "ecr_api_repository_url" {
  description = "Repository URL for the Collabboard API image."
  value       = aws_ecr_repository.main["collabboard-api"].repository_url
}

output "ecr_front_repository_url" {
  description = "Repository URL for the Collabboard frontend image."
  value       = aws_ecr_repository.main["collabboard-front"].repository_url
}

output "github_deploy_role_arn" {
  description = "ARN of the GitHub Actions deployment role."
  value       = aws_iam_role.github_deploy.arn
}

output "ecs_execution_role_arn" {
  description = "ARN of the ECS task execution role."
  value       = aws_iam_role.ecs_execution.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS application task role."
  value       = aws_iam_role.ecs_task.arn
}

output "db_credentials_secret_arn" {
  description = "ARN of the structured database credentials secret."
  value       = aws_secretsmanager_secret.db_credentials.arn
  sensitive   = false
}

output "redis_auth_secret_arn" {
  description = "ARN of the Redis connection secret."
  value       = aws_secretsmanager_secret.redis_auth.arn
  sensitive   = false
}

output "jwt_secret_arn" {
  description = "ARN of the JWT signing secret."
  value       = aws_secretsmanager_secret.jwt_secret.arn
  sensitive   = false
}

output "alb_dns_name" {
  description = "Public DNS name of the application load balancer."
  value       = aws_lb.main.dns_name
}

output "api_target_group_arn" {
  description = "ARN of the API load balancer target group."
  value       = aws_lb_target_group.api.arn
}

output "front_target_group_arn" {
  description = "ARN of the frontend load balancer target group."
  value       = aws_lb_target_group.front.arn
}

output "ecs_cluster_name" {
  description = "Name of the Collabboard ECS cluster."
  value       = aws_ecs_cluster.main.name
}

output "api_service_name" {
  description = "Name of the Collabboard API ECS service."
  value       = aws_ecs_service.api.name
}

output "front_service_name" {
  description = "Name of the Collabboard frontend ECS service."
  value       = aws_ecs_service.front.name
}

output "sns_topic_arn" {
  description = "ARN of the Collabboard alerting SNS topic."
  value       = aws_sns_topic.alerts.arn
}
