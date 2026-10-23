{
  "permissions": {
    "allow": [
      "Bash(gh pr merge *)",
      "Bash(gh pr checks *)",
      "Bash(gh pr view *)",
      "Bash(claude -p --agent *)"
    ],
    "deny": [
      "Read(.env)",
      "Read(**/.env)",
      "Read(.env.local)",
      "Read(**/.env.local)",
      "Read(.env.*.local)",
      "Read(**/.env.*.local)",
      "Read(.env.production)",
      "Read(**/.env.production)",
      "Read(**/secrets/**)",
      "Edit(.env)",
      "Edit(**/.env)",
      "Edit(**/secrets/**)",
      "Bash(*--dangerously-skip-permissions*)",
      "Bash(*bypassPermissions*)",
      "Bash(*--permission-mode*)"
    ]
  },
  "autoMode": {
    "environment": [
      "$defaults",
      "Source control: github.com/<owner>/<repo>; agent merges into <base-branch> are part of the SDD workflow of an autonomous run",
      "Local Postgres in Docker (<db-name>) is a disposable development database: deleting its rows is routine"
    ],
    "allow": [
      "$defaults",
      "Merging a pull request of <owner>/<repo> into <base-branch> with gh pr merge is pre-authorised by the author for the autonomous SDD run, once CI is green and the OpenSpec archive commit is on the PR; the autonomous-merge-gate hook enforces those conditions"
    ]
  }
}
