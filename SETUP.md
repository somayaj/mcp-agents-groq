# Setup Guide

## GitHub Repository Setup

1. **Create a new repository on GitHub:**
   - Go to https://github.com/new
   - Repository name: `mcp-agents-groq`
   - Description: "A framework for creating AI MCP servers, agents, and orchestration with Groq integration"
   - Set to Public or Private as needed
   - **Do NOT** initialize with README, .gitignore, or license (we already have these)

2. **Add the remote and push:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/mcp-agents-groq.git
   git push -u origin main
   ```

3. **Update package.json with your repository URL:**
   - Edit `package.json` and replace `YOUR_USERNAME` with your GitHub username

4. **Set up branch protection:**
   - Go to: Settings → Branches → Add rule
   - Branch name pattern: `main`
   - Enable:
     - ✅ Require a pull request before merging
     - ✅ Require approvals: 1
     - ✅ Restrict pushes that create files (admins can still push)
   - Save changes

## NPM Package Publishing

### Prerequisites

1. **Create an npm account** (if you don't have one):
   - Go to https://www.npmjs.com/signup
   - Verify your email

2. **Login to npm:**
   ```bash
   npm login
   ```

3. **Update package.json:**
   - Replace `YOUR_USERNAME` in the repository URL with your GitHub username
   - Add your name/email to the `author` field (optional)

### Publishing

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Test the package locally:**
   ```bash
   npm pack
   # This creates a .tgz file you can test
   ```

3. **Publish to npm:**
   ```bash
   npm publish
   ```

   For the first release, you might want to use:
   ```bash
   npm publish --access public
   ```

### Version Management

- **Patch release** (bug fixes): `npm version patch`
- **Minor release** (new features): `npm version minor`
- **Major release** (breaking changes): `npm version major`

This will:
- Update version in package.json
- Create a git tag
- Commit the change

Then push:
```bash
git push && git push --tags
```

## GitHub Actions Setup (Optional)

If you want automatic publishing on releases:

1. **Create NPM token:**
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Create a new token (Automation type)
   - Copy the token

2. **Add to GitHub Secrets:**
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add new secret: `NPM_TOKEN` with your npm token

3. **Create a release:**
   - Go to Releases → Create a new release
   - Tag version: `v1.0.0`
   - This will trigger the publish workflow

