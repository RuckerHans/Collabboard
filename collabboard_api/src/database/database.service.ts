import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, EntityManager } from 'typeorm';

type Store = { manager: EntityManager; userId: string };

@Injectable()
export class DatabaseService {
  private readonly als = new AsyncLocalStorage<Store>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  get manager(): EntityManager {
    return this.als.getStore()?.manager ?? this.dataSource.manager;
  }

  get currentUserId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  get source(): DataSource {
    return this.dataSource;
  }

  async runInRlsTransaction<T>(
    userId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('SELECT set_config($1, $2, true)', [
        'app.current_user_id',
        userId,
      ]);
      const result = await this.als.run(
        { manager: queryRunner.manager, userId },
        work,
      );
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
