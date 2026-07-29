# Publishing

- When the user authorizes a ChatGPT Sites publish, deploy the validated commit to the existing Sites project and push that exact commit to the GitHub `origin` repository.
- Do not report publishing complete until the Sites deployment succeeds, `origin/main` contains the deployed commit, and the GitHub Pages deployment for that commit succeeds.
- Verify both the `chatgpt.site` URL and `easterlingmediasystems.com` when the change affects rendered website content.
- Preserve the site's existing access settings unless the user explicitly requests an access change.
