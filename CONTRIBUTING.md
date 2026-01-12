# Contributing to ICanHazPDF

First off, thanks for taking the time to contribute! This project exists because researchers shouldn't have to beg strangers on Twitter for PDFs.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide the paper title you were searching for**
- **Include the error message or unexpected behavior**
- **Mention your Node.js version** (`node --version`)

### Suggesting New Sources

Want to add a new paper source? Great! Please:

1. Open an issue first to discuss the source
2. Verify the source has a public API
3. Check their terms of service allow this use case
4. Ensure it provides open access PDFs (not paywalled content)

### Adding a New Fetcher

1. Create a new file in `src/fetchers/yourSource.mjs`
2. Export a function: `export async function fetchFromYourSource(title)`
3. Return the standard result format:

```javascript
// Success
{
  success: true,
  pdf_url: "https://...",
  source: "YourSource",
  metadata: { title, authors, year, doi }
}

// Failure
{
  success: false,
  error: "Description of what went wrong",
  doi: "10.xxx/xxx" // if found, for Unpaywall fallback
}
```

4. Add to the strategies array in `src/paperFetcher.mjs`
5. Add tests and update documentation

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Run `npm install` to get dependencies
3. Make your changes
4. Run `npm test` to ensure tests pass
5. Update documentation if needed
6. Submit the PR!

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/icanhazpdf.git
cd icanhazpdf

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Run in development mode
npm run dev

# Run tests
npm test
```

## Code Style

- Use ES modules (`.mjs` files)
- Use async/await for asynchronous code
- Add JSDoc comments for public functions
- Keep functions focused and small
- Handle errors gracefully - never crash on API failures

## Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Keep the first line under 72 characters
- Reference issues and PRs in the body when relevant

## Questions?

Feel free to open an issue with your question. We're here to help!
