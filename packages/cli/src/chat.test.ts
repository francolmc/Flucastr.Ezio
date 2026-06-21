import { describe, it, expect, vi } from 'vitest';
import { handleLine } from './chat';

describe('handleLine', () => {
  it('returns null for exit command', async () => {
    const client = { send: vi.fn() };
    const result = await handleLine('exit', client as any);
    expect(result).toBeNull();
  });

  it('returns null for EXIT (uppercase)', async () => {
    const client = { send: vi.fn() };
    const result = await handleLine('EXIT', client as any);
    expect(result).toBeNull();
  });

  it('returns empty string for empty input', async () => {
    const client = { send: vi.fn() };
    const result = await handleLine('', client as any);
    expect(result).toBe('');
    expect(client.send).not.toHaveBeenCalled();
  });

  it('returns empty string for whitespace only', async () => {
    const client = { send: vi.fn() };
    const result = await handleLine('   ', client as any);
    expect(result).toBe('');
    expect(client.send).not.toHaveBeenCalled();
  });

  it('calls client.send and returns response for normal input', async () => {
    const client = { send: vi.fn().mockResolvedValue('Hello back') };
    const result = await handleLine('Hello', client as any);
    expect(result).toBe('Hello back');
    expect(client.send).toHaveBeenCalledWith('Hello');
  });

  it('preserves original case in client.send call', async () => {
    const client = { send: vi.fn().mockResolvedValue('Response') };
    await handleLine('Hello World', client as any);
    expect(client.send).toHaveBeenCalledWith('Hello World');
  });
});
