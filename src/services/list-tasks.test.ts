/**
 * listTasks：所有未刪除的任務（唯讀，不日結）。給預設庫「已加入」與進階編輯使用。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, boot, resetIndexedDb, taipei } from '../../tests/helpers/services';
import type { AppService } from './app-service';

const TUE = taipei(2026, 10, 27, 10); // 週二：test_daily_b（一三五）沒排
let services: AppService[] = [];

beforeEach(() => {
  resetIndexedDb();
  services = [];
});

afterEach(() => {
  for (const s of services) s.dispose();
});

describe('listTasks', () => {
  it('包含今天沒排到的 Daily 與已完成的 To-do；不含已刪除；刪除後記錄仍在（軟刪除）', async () => {
    const { service } = await boot(new FakeClock(TUE));
    services.push(service);
    await service.selectClass('test_class_a');
    const todo = await service.addTaskFromTemplate('test_todo_c');
    if (!todo.ok) throw new Error('add failed');
    await service.completeTodo(todo.value.id);

    const today = (await service.getTodayView())!;
    expect(today.dailies).toHaveLength(0);
    expect(today.todos).toHaveLength(0);

    const all = await service.listTasks();
    expect(all.map((t) => t.sourceTemplateId).sort()).toEqual([
      'test_daily_b',
      'test_habit_a',
      'test_todo_c',
    ]);

    const daily = all.find((t) => t.type === 'daily')!;
    expect((await service.deleteTask(daily.id)).ok).toBe(true);
    expect((await service.listTasks()).some((t) => t.id === daily.id)).toBe(false);
    const stored = await service.context.storage.tasks.get(daily.id);
    expect(stored?.deletedAt).not.toBeNull();
    expect(stored?.updatedAt).toBe(stored?.deletedAt);
  });

  it('尚未選職業 → 空陣列，不寫入', async () => {
    const { service } = await boot(new FakeClock(TUE));
    services.push(service);
    expect(await service.listTasks()).toEqual([]);
  });
});

describe('getClassSelectedDayKey', () => {
  it('選職業前為 null；選職業後為那天的遊戲日', async () => {
    const { service } = await boot(new FakeClock(TUE));
    services.push(service);
    expect(await service.getClassSelectedDayKey()).toBeNull();
    await service.selectClass('test_class_a');
    expect(await service.getClassSelectedDayKey()).toBe('2026-10-27');
  });
});
