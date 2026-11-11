/**
 * Helper to fetch all rows from a Supabase query in `.range()` chunks,
 * avoiding Supabase's default 1,000-row ceiling.
 */
export async function fetchAllSupabasePaged<T = any>(
  queryBuilder: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<{ data: T[]; error: any }> {
  let allData: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder(from, to);

    if (error) {
      return { data: allData, error };
    }

    if (!data || data.length === 0) {
      break;
    }

    allData = allData.concat(data);

    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return { data: allData, error: null };
}

