import type { GoogleSyncState } from '@/lib/types/evento'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

/** Estado del sync con Google Calendar (fila única por calendar_id). Solo service role. */
export class GoogleSyncRepository {
  private sb: SB

  constructor(supabase: SB) {
    this.sb = supabase
  }

  async get(calendarId: string): Promise<GoogleSyncState | null> {
    const { data, error } = await this.sb
      .from('google_sync_state')
      .select('*')
      .eq('calendar_id', calendarId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  async upsert(state: Partial<GoogleSyncState> & { calendar_id: string }): Promise<void> {
    const { error } = await this.sb
      .from('google_sync_state')
      .upsert(state, { onConflict: 'calendar_id' })
    if (error) throw new Error(error.message)
  }

  async setSyncToken(calendarId: string, syncToken: string | null): Promise<void> {
    await this.upsert({
      calendar_id: calendarId,
      sync_token: syncToken,
      last_sync_at: new Date().toISOString(),
    })
  }

  async setChannel(
    calendarId: string,
    channel: { channel_id: string | null; resource_id: string | null; channel_expiration: string | null }
  ): Promise<void> {
    await this.upsert({ calendar_id: calendarId, ...channel })
  }
}
