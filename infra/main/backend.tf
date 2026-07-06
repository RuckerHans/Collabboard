terraform {
  backend "s3" {
    bucket       = "collabboard-tfstate-2b548354"
    key          = "collabboard/production/terraform.tfstate"
    region       = "ap-southeast-2"
    use_lockfile = true
    encrypt      = true
  }
}
