{
  "permissions": {
    "allow": [
      "Shell(gh pr merge)",
      "Shell(gh pr checks)",
      "Shell(gh pr view)",
      "Shell(npx vitest)",
      "Shell(npm test)"
    ],
    "deny": [
      "Read(.env)",
      "Read(**/.env)",
      "Read(**/.env.local)",
      "Read(**/.env.production)",
      "Read(**/secrets/**)",
      "Write(.env)",
      "Write(**/.env)",
      "Write(.claude/**)",
      "Write(.cursor/**)",
      "Write(**/secrets/**)"
    ]
  }
}
