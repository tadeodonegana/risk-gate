import * as core from '@actions/core';
import { context } from '@actions/github';
import { DEFAULT_CONFIG_PATH } from './config.ts';
import { renderComment } from './core/comment.ts';
import { createGitHubPort } from './github.ts';
import { askJev, DEFAULT_API_URL } from './jev.ts';
import { run } from './run.ts';

async function main(): Promise<void> {
  const prNumber = context.payload.pull_request?.number;
  if (typeof prNumber !== 'number') {
    core.setFailed(`risk-gate runs only on pull request events. This event is "${context.eventName}".`);
    return;
  }
  const apiKey = core.getInput('api-key');
  if (apiKey) core.setSecret(apiKey);
  const { owner, repo } = context.repo;

  const result = await run(
    {
      prNumber,
      eventName: context.eventName,
      configPath: core.getInput('config-path') || DEFAULT_CONFIG_PATH,
      apiUrl: core.getInput('api-url') || DEFAULT_API_URL,
      apiKey,
      runUrl: `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`,
    },
    {
      gh: createGitHubPort(core.getInput('github-token', { required: true }), owner, repo),
      ask: askJev,
      log: core.info,
      warn: core.warning,
    },
  );

  if (result.skipped) {
    core.notice(result.skipped);
    return;
  }
  const { decision, gate } = result;
  if (!decision || !gate) return;
  core.setOutput('tier', decision.tierName);
  core.setOutput('required-approvals', decision.required);
  core.setOutput('approvals', gate.approvers.length);
  core.setOutput('state', gate.state);
  core.setOutput('cached', result.cached ?? false);
  await core.summary
    .addRaw(renderComment(decision, 'enforce'))
    .addRaw(`\n\n**Status:** ${gate.state} (${gate.description})\n`)
    .write();
}

main().catch((e: unknown) => core.setFailed(e instanceof Error ? e.message : String(e)));
