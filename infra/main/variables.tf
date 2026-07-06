variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging."
  type        = string
  default     = "collabboard"
}

variable "aws_region" {
  description = "AWS region in which to deploy Collabboard."
  type        = string
  default     = "ap-southeast-2"
}

variable "db_instance_class" {
  description = "RDS database instance class."
  type        = string
  default     = "db.t3.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL engine version for the RDS instance."
  type        = string
  default     = "16.14"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_engine_version" {
  description = "Redis OSS engine version for the ElastiCache replication group."
  type        = string
  default     = "7.1"
}

variable "alert_email" {
  description = "Email address subscribed to Collabboard infrastructure alerts."
  type        = string
}
