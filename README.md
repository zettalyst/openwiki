# OpenWiki

OpenWiki is a CLI that writes and maintains documentation for your codebase, built specifically for agents.

![OpenWiki](https://raw.githubusercontent.com/langchain-ai/openwiki/main/static/openwiki.png)

## Install

```sh
npm install -g openwiki
```

To install this fork directly from GitHub:

```sh
npm install -g https://github.com/zettalyst/openwiki/archive/refs/heads/main.tar.gz
```

## Quick Start

Initialize OpenWiki, configure your model and API key, then generate documentation

```sh
openwiki --init
```

Then to ensure your documentation stays up-to-date, add the GitHub action to your repository to automatically open a PR once a day with documentation updates: [openwiki-update.yml](./examples/openwiki-update.yml)

Copy the contents of that file into `.github/workflows/openwiki-update.yml` in your repository.

## Usage

Start the interactive CLI:

```sh
openwiki
```

Start OpenWiki with an initial request:

```sh
openwiki "Please generate documentation for this repository"
```

Run a single command and exit:

```sh
openwiki -p "Summarize what you can do"
```

Initialize OpenWiki:

```sh
openwiki --init
```

Update existing documentation:

```sh
openwiki --update
```

Choose the documentation language for a run:

```sh
openwiki --init --language en
```

Show help:

```sh
openwiki --help
```

`openwiki` creates initial documentation in `openwiki/` when no wiki exists. If `openwiki/` already exists, it refreshes that documentation from repository changes. By default, the CLI stays open after each run so you can send follow-up messages. Use `-p` or `--print` for a one-shot non-interactive run that prints the final assistant output.

`openwiki` will automatically append prompting to your `AGENTS.md` and/or `CLAUDE.md` files to instruct your coding agent to reference it when searching for context. If the file does not already exist in your repository, OpenWiki will create it for you.

On the first interactive run, OpenWiki will have you configure your inference provider, provider credential, and LLM. You will also be able to set a LangSmith API key to trace your OpenWiki runs to a LangSmith tracing project named "openwiki" (optional).

These configuration options and secrets will be saved to `~/.openwiki/.env` on your local machine.

## Customizing

OpenWiki supports OpenRouter, Fireworks, Baseten, OpenAI, an OpenAI-compatible provider, and Anthropic out of the box. By default, there are a few models pre-defined (GLM 5.2, Kimi K2.6, Sonnet 5, etc) but for each inference provider, OpenWiki will allow you to specify your own custom model ID.

### Documentation language

OpenWiki writes wiki documentation in Korean (한국어) by default. The language
is resolved in this order: the `--language` flag (or the `/language` slash
command in chat), the language recorded in `openwiki/.last-update.json` for the
repository, the `OPENWIKI_LANGUAGE` environment variable (including
`~/.openwiki/.env`), and finally the built-in default `ko`. Common aliases are
normalized (`korean`/`한국어` → `ko`, `english` → `en`, and so on); other
values pass through as free-form language names.

Because the repository's recorded language outranks `OPENWIKI_LANGUAGE`, an
existing wiki keeps its language on plain `--update` runs even if the global
default changes. Passing `--language` explicitly for an update run whose wiki
was recorded in a different language triggers a language migration run that
rewrites every wiki page in the requested language. Wikis generated before this
option existed are treated as English. Code identifiers, commands, file names,
and the OpenWiki reference section in `AGENTS.md`/`CLAUDE.md` always stay in
their original English form.

### Provider selection

`OPENWIKI_PROVIDER` wins when set to a valid provider id; an invalid value is
ignored (with a diagnostics warning) and detection proceeds as if it were
unset. Without a valid setting, OpenWiki picks the first provider whose usable
credentials are already present in the environment (or `~/.openwiki/.env`),
checked in this order: OpenRouter, Baseten, Fireworks, OpenAI,
OpenAI-compatible (only when its base URL is also set), Anthropic. Providers
whose credentials are misconfigured — for example an OAuth token placed in
`ANTHROPIC_API_KEY` — are skipped by detection. This means an environment with
only `CLAUDE_CODE_OAUTH_TOKEN` (or another Anthropic credential) runs on the
Anthropic provider without any extra configuration. When no credentials are
found anywhere, OpenWiki defaults to OpenRouter.

### Anthropic reasoning defaults

The Anthropic provider defaults to `claude-opus-4-8`. Claude 4.6+ models run
with adaptive thinking and a 64K output-token ceiling, and xhigh-capable models
(Opus 4.7/4.8, Sonnet 5) default to `effort: "xhigh"` — the recommended setting
for agentic documentation work. Set `OPENWIKI_MODEL_EFFORT` to
`low`/`medium`/`high`/`xhigh`/`max` to override the effort level, or to `none`
to omit the effort parameter. Models without adaptive-thinking support (e.g.
Haiku 4.5) run with plain API defaults.

### Alternative base URLs

To route the Anthropic provider at an alternative, Anthropic-compatible endpoint
(for example a self-hosted or proxied gateway) instead of the default API, set
`ANTHROPIC_BASE_URL` alongside `ANTHROPIC_API_KEY`:

```bash
OPENWIKI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key
ANTHROPIC_BASE_URL=https://your-gateway.example.com/anthropic
```

The Anthropic provider can also use bearer credentials. `ANTHROPIC_AUTH_TOKEN`
takes priority over `ANTHROPIC_API_KEY`, and `CLAUDE_CODE_OAUTH_TOKEN` is used
as a fallback when neither Anthropic credential is set. Bearer requests include
the OAuth beta header. When the credential comes from `CLAUDE_CODE_OAUTH_TOKEN`,
OpenWiki also prepends an OpenWiki-identified Claude Code billing system block
so Sonnet-class requests are routed through the Claude Code subscription path.
Do not put a Claude Code OAuth token in `ANTHROPIC_API_KEY`; that env var is for
Anthropic Console API keys only.

To smoke-test a Claude Code OAuth token generated with `claude setup-token`:

```bash
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
export OPENWIKI_PROVIDER=anthropic
export OPENWIKI_MODEL_ID=claude-sonnet-5
export CLAUDE_CODE_OAUTH_TOKEN='...'
pnpm exec tsx src/cli.tsx -p "Return exactly OK."
```

### OpenAI-compatible endpoints

The `openai-compatible` provider targets any OpenAI-compatible chat-completions
endpoint via a required base URL. This can be used for OpenAI-compatible LLM
endpoints like those exposed by a LiteLLM gateway when it is used as a gateway —
letting you reach whatever upstream providers the gateway fronts through a single
OpenAI-shaped API. Set the model ID to whatever name the gateway exposes:

```bash
OPENWIKI_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=your-gateway-key
OPENAI_COMPATIBLE_BASE_URL=https://your-gateway.example.com/v1
OPENWIKI_MODEL_ID=your-gateway-model-name
```

Base URLs (and all credentials) can be set in your environment or stored in `~/.openwiki/.env`.

If there's an inference provider or model you'd like to see added, please open a PR!
