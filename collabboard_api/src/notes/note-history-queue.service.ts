import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

export interface NoteHistoryEvent {
  noteId: string;
  boardId: string;
  changedBy: string;
  operation: string;
  versionBefore: number | null;
  versionAfter: number | null;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  changedFields: string[];
}

@Injectable()
export class NoteHistoryQueueService {
  private readonly logger = new Logger(NoteHistoryQueueService.name);
  private readonly client = new SQSClient({});
  private readonly queueUrl?: string;

  constructor(config: ConfigService) {
    this.queueUrl = config.get<string>('NOTE_HISTORY_QUEUE_URL');

    if (!this.queueUrl) {
      this.logger.warn(
        'NOTE_HISTORY_QUEUE_URL is not set -- note-history events will not be published',
      );
    }
  }

  async publish(entry: NoteHistoryEvent): Promise<void> {
    if (!this.queueUrl) return;

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(entry),
        }),
      );
    } catch (error) {
      this.logger.error('Failed to publish note-history event', error as Error);
    }
  }
}
