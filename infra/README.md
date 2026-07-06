# Collabboard infrastructure

This directory contains two separate Terraform root modules:

- `bootstrap/` is a one-time, local-state configuration that creates the S3
  bucket used by Terraform's remote backend. Apply it manually once, record
  its outputs, and then leave it essentially untouched.
- `main/` is the real Collabboard infrastructure project. Its S3 backend uses
  the bucket name output by the bootstrap configuration.

The bootstrap configuration also creates the legacy `collabboard-tf-locks`
DynamoDB table, but `main/` now uses native S3 lockfiles and no longer requires
that table. It can be removed later by running a targeted `terraform destroy`
from `infra/bootstrap`:

```sh
terraform destroy -target=aws_dynamodb_table.terraform_locks
```

Do this manually only when you are ready; the bootstrap project uses local
state and will not remove the table automatically.

Bootstrap the remote backend:

```sh
cd infra/bootstrap
terraform init
terraform plan
terraform apply
```

Then initialize the main project:

```sh
cd ../main
terraform init
```
