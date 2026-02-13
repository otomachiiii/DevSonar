import { exec } from 'child_process';
import { promisify } from 'util';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ErrorReport, RelayConfig } from './types.js';
import { SessionManager } from './session-manager.js';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

interface SDKInitMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
}

interface SDKAssistantMessage {
  type: 'assistant';
  content: Array<{ type: string; text?: string }> | string;
  message?: { content: string };
}

interface SDKResultMessage {
  type: 'result';
  result: string;
}

type SDKMessage = SDKInitMessage | SDKAssistantMessage | SDKResultMessage | { type: string };

export class AIClient {
  constructor(
    private config: RelayConfig,
    private sessionManager: SessionManager,
  ) {}

  async send(errors: ErrorReport[]): Promise<void> {
    const prompt = this.buildPrompt(errors);

    logger.debug('AI Client', `=== Prompt ===\n${prompt}\n=== End Prompt ===`);

    if (this.config.claudeMode === 'sdk') {
      await this.sendViaSDK(prompt);
    } else {
      await this.sendViaCLI(prompt);
    }
  }

  private buildPrompt(errors: ErrorReport[]): string {
    const errorCount = errors.length;
    const timestamp = new Date().toISOString();

    let prompt = `# Runtime Error Detected (${errorCount} error${errorCount > 1 ? 's' : ''})\n\n`;
    prompt += `**Timestamp**: ${timestamp}\n\n`;
    prompt += `The following error${errorCount > 1 ? 's have' : ' has'} been detected. **Please refer to the project source code to identify the cause and apply a fix.**\n\n`;

    errors.forEach((error, index) => {
      prompt += `## Error ${index + 1}/${errorCount}\n\n`;
      prompt += `**Message**: \`${error.message}\`\n\n`;
      if (error.source) {
        prompt += `**Source**: ${error.source}\n\n`;
      }
      if (error.stack) {
        const stack = this.truncateStack(error.stack);
        prompt += `**Stack Trace**:\n\`\`\`\n${stack}\n\`\`\`\n\n`;
      }
      if (error.context) {
        const contextStr = JSON.stringify(error.context, null, 2);
        if (contextStr.length < 1000) {
          prompt += `**Context**:\n\`\`\`json\n${contextStr}\n\`\`\`\n\n`;
        }
      }
      prompt += `---\n\n`;
    });

    prompt += `\n**Please perform the following actions**:\n\n`;
    prompt += `1. Identify the error location from each stack trace\n`;
    prompt += `2. Read the relevant source code files\n`;
    prompt += `3. Analyze the root cause of the error\n`;
    prompt += `4. Propose a fix and apply the code changes if possible\n`;
    prompt += `5. Once the fix is applied, run \`git diff\` and report the changes\n\n`;
    prompt += `**Important**: Do NOT run \`git add\` or \`git commit\`. Do not stage any changes — only review the diff.\n\n`;

    return prompt;
  }

  private truncateStack(stack: string): string {
    if (stack.length <= this.config.maxStackLength) {
      return stack;
    }
    return stack.substring(0, this.config.maxStackLength) + '\n... (truncated)';
  }

  private async sendViaSDK(prompt: string): Promise<void> {
    try {
      await this.executeSDKQuery(prompt);
    } catch (error) {
      const sessionId = this.sessionManager.getSessionId();
      if (sessionId) {
        logger.warn('AI Client', `Resume failed for session ${sessionId}, retrying with new session...`);
        await this.sessionManager.reset();
        await this.executeSDKQuery(prompt);
      } else {
        throw error;
      }
    }
  }

  private async executeSDKQuery(prompt: string): Promise<void> {
    const sessionId = this.sessionManager.getSessionId();
    logger.info('AI Client', 'Sending via Agent SDK...');
    logger.debug('AI Client', `Session ID: ${sessionId || 'new session'}`);

    for await (const message of query({
      prompt,
      options: {
        cwd: this.config.projectDir,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: 30,
        ...(sessionId ? { resume: sessionId } : {}),
      },
    })) {
      const sdkMessage = message as SDKMessage;
      logger.debug('AI Client', `SDK message: type=${sdkMessage.type} subtype=${'subtype' in sdkMessage ? sdkMessage.subtype : '-'}`);

      if (sdkMessage.type === 'system' && 'subtype' in sdkMessage && sdkMessage.subtype === 'init') {
        const initMsg = sdkMessage as SDKInitMessage;
        await this.sessionManager.saveSessionId(initMsg.session_id);
      }
      if (sdkMessage.type === 'assistant') {
        const assistantMsg = sdkMessage as SDKAssistantMessage;
        const text = Array.isArray(assistantMsg.content)
          ? assistantMsg.content.map((b) => b.text || '').join('')
          : assistantMsg.message?.content || JSON.stringify(assistantMsg);
        logger.debug('AI Client', `=== AI Response ===\n${text}\n=== End AI Response ===`);
      }
      if (sdkMessage.type === 'result') {
        const resultMsg = sdkMessage as SDKResultMessage;
        logger.debug('AI Client', `=== Result ===\n${resultMsg.result}\n=== End Result ===`);
      }
    }

    logger.info('AI Client', 'Successfully sent via Agent SDK');
  }

  private async sendViaCLI(prompt: string): Promise<void> {
    try {
      const sessionId = this.sessionManager.getSessionId();
      const escapedPrompt = prompt.replace(/'/g, "'\\''");
      const resumeFlag = sessionId ? `--resume ${sessionId}` : '';
      const command = `echo '${escapedPrompt}' | claude -p --dangerously-skip-permissions ${resumeFlag}`;

      logger.info('AI Client', 'Sending to Claude Code CLI...');
      logger.debug('AI Client', `Session ID: ${sessionId || 'new session'}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.config.projectDir,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 300000,
      });

      if (stderr) {
        logger.error('AI Client', `Claude Code stderr: ${stderr}`);
      }
      if (stdout) {
        logger.debug('AI Client', `=== AI Response ===\n${stdout}\n=== End AI Response ===`);
      }

      logger.info('AI Client', 'Successfully sent to Claude Code CLI');
    } catch (error) {
      logger.error('AI Client', 'Failed to send to Claude Code:', error);
      throw error;
    }
  }
}
