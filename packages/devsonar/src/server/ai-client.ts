import { exec } from 'child_process';
import { promisify } from 'util';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ErrorReport, RelayConfig } from './types.js';
import { SessionManager } from './session-manager.js';

const execAsync = promisify(exec);

export class AIClient {
  constructor(
    private config: RelayConfig,
    private sessionManager: SessionManager,
  ) {}

  async send(errors: ErrorReport[]): Promise<void> {
    const prompt = this.buildPrompt(errors);

    console.log(`[AI Client] === Prompt ===\n${prompt}\n[AI Client] === End Prompt ===`);

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
        console.warn(`[AI Client] Resume failed for session ${sessionId}, retrying with new session...`);
        await this.sessionManager.reset();
        await this.executeSDKQuery(prompt);
      } else {
        throw error;
      }
    }
  }

  private async executeSDKQuery(prompt: string): Promise<void> {
    const sessionId = this.sessionManager.getSessionId();
    console.log(`[AI Client] Sending via Agent SDK...`);
    console.log(`[AI Client] Session ID: ${sessionId || 'new session'}`);

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
      console.log(`[AI Client] SDK message: type=${message.type} subtype=${(message as any).subtype || '-'}`);
      if (message.type === 'system' && message.subtype === 'init') {
        await this.sessionManager.saveSessionId((message as any).session_id);
      }
      if (message.type === 'assistant') {
        const msg = message as any;
        const text = Array.isArray(msg.content)
          ? msg.content.map((b: any) => b.text || '').join('')
          : msg.message?.content || JSON.stringify(msg);
        console.log(`[AI Client] === AI Response ===\n${text}\n[AI Client] === End AI Response ===`);
      }
      if (message.type === 'result') {
        console.log(`[AI Client] === Result ===\n${(message as any).result}\n[AI Client] === End Result ===`);
      }
    }

    console.log(`[AI Client] Successfully sent via Agent SDK`);
  }

  private async sendViaCLI(prompt: string): Promise<void> {
    try {
      const sessionId = this.sessionManager.getSessionId();
      const escapedPrompt = prompt.replace(/'/g, "'\\''");
      const resumeFlag = sessionId ? `--resume ${sessionId}` : '';
      const command = `echo '${escapedPrompt}' | claude -p --dangerously-skip-permissions ${resumeFlag}`;

      console.log(`[AI Client] Sending to Claude Code CLI...`);
      console.log(`[AI Client] Session ID: ${sessionId || 'new session'}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.config.projectDir,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 300000,
      });

      if (stderr) {
        console.error(`[AI Client] Claude Code stderr:`, stderr);
      }
      if (stdout) {
        console.log(`[AI Client] === AI Response ===\n${stdout}\n[AI Client] === End AI Response ===`);
      }

      console.log(`[AI Client] Successfully sent to Claude Code CLI`);
    } catch (error) {
      console.error(`[AI Client] Failed to send to Claude Code:`, error);
      throw error;
    }
  }
}
