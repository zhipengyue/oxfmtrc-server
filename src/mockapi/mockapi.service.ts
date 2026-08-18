import { Injectable } from '@nestjs/common';

export interface MockTableRow {
  id: number;
  name: string;
  email: string;
  department: string;
  status: 'active' | 'inactive' | 'pending';
  amount: number;
  createdAt: string;
}

export interface MockTableResponse {
  list: MockTableRow[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class MockapiService {
  private readonly allRows: MockTableRow[] = this.buildSeedRows();

  getTable(page = 1, pageSize = 10): MockTableResponse {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const start = (safePage - 1) * safeSize;
    const list = this.allRows.slice(start, start + safeSize);

    return {
      list,
      total: this.allRows.length,
      page: safePage,
      pageSize: safeSize,
    };
  }

  /** 不分页，返回全部（适合小数据量调试） */
  getTableAll(): { list: MockTableRow[]; total: number } {
    return { list: this.allRows, total: this.allRows.length };
  }

  private buildSeedRows(): MockTableRow[] {
    const departments = ['研发部', '产品部', '市场部', '运营部', '财务部'];
    const statuses: MockTableRow['status'][] = [
      'active',
      'inactive',
      'pending',
    ];
    const rows: MockTableRow[] = [];

    for (let i = 1; i <= 57; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      rows.push({
        id: i,
        name: `用户${i}`,
        email: `user${i}@example.com`,
        department: departments[i % departments.length],
        status: statuses[i % statuses.length],
        amount: Math.round((i * 137.5 + 99) * 100) / 100,
        createdAt: `2026-0${(i % 9) + 1}-${day}T08:00:00.000Z`,
      });
    }

    return rows;
  }
}
