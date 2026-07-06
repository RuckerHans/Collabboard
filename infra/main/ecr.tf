locals {
  ecr_repositories = toset([
    "collabboard-api",
    "collabboard-front",
  ])
}

resource "aws_ecr_repository" "main" {
  for_each = local.ecr_repositories

  name = each.value

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = each.value
  }
}

resource "aws_ecr_lifecycle_policy" "main" {
  for_each = local.ecr_repositories

  repository = aws_ecr_repository.main[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after one day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep only the ten most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}
