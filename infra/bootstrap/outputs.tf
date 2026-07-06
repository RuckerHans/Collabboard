output "terraform_state_bucket" {
  description = "S3 bucket name to copy into infra/main/backend.tf."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "terraform_lock_table" {
  description = "DynamoDB table used for Terraform state locking."
  value       = aws_dynamodb_table.terraform_locks.name
}

output "aws_region" {
  description = "AWS region containing the Terraform state backend."
  value       = var.aws_region
}
