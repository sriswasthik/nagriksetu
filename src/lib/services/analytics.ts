import { 
  mockAnalyticsSummary, 
  mockTrendData, 
  mockCategoryDistribution, 
  mockDepartmentPerformance, 
  mockSLAData, 
  mockWardHealth 
} from '../mock/analytics';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const analyticsService = {
  async getSummary() {
    await delay(400);
    return mockAnalyticsSummary;
  },

  async getTrends() {
    await delay(500);
    return mockTrendData;
  },

  async getCategoryDistribution() {
    await delay(300);
    return mockCategoryDistribution;
  },

  async getDepartmentPerformance() {
    await delay(600);
    return mockDepartmentPerformance;
  },

  async getSLAData() {
    await delay(400);
    return mockSLAData;
  },

  async getWardHealth() {
    await delay(700);
    return mockWardHealth;
  }
};
