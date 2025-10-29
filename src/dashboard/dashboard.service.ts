import { Injectable } from '@nestjs/common';
import { FirebaseConfig } from '../database/firebase/firebase.config';
import * as admin from 'firebase-admin';

@Injectable()
export class DashboardService {
  private firestore: admin.firestore.Firestore;

  constructor(private readonly firebaseConfig: FirebaseConfig) {
    this.firestore = this.firebaseConfig.getFirestore();
  }

  async getDashboardStatistics() {
    try {
      console.log('📊 [DASHBOARD] Fetching dashboard statistics...');

      // Fetch all data in parallel
      const [
        usersSnapshot,
        coachesSnapshot,
        strategiesSnapshot,
        subscriptionsSnapshot,
        walletsSnapshot,
      ] = await Promise.all([
        this.firestore.collection('users').get(),
        this.firestore.collection('coaches').get(),
        this.firestore.collection('strategies').get(),
        this.firestore.collection('subscriptions').get(),
        this.firestore.collection('wallets').get(),
      ]);

      // Process users
      const users = usersSnapshot.docs.map(doc => doc.data());
      const activeUsers = users.filter(u => u.status === 'active').length;
      const bannedUsers = users.filter(u => u.status === 'banned').length;
      const usersWithCoaches = users.filter(u => u.assignedCoachId).length;
      const usersWithoutCoaches = users.length - usersWithCoaches;

      // Process coaches
      const coaches = coachesSnapshot.docs.map(doc => doc.data());
      const approvedCoaches = coaches.filter(c => c.status === 'approved').length;
      const pendingCoaches = coaches.filter(c => c.status === 'pending').length;
      const rejectedCoaches = coaches.filter(c => c.status === 'rejected' || c.status === 'completely_rejected').length;
      const bannedCoaches = coaches.filter(c => c.status === 'banned').length;

      // Process strategies
      const strategies = strategiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const activeStrategies = strategies.filter(s => s.status === 'active').length;

      // Process subscriptions
      const subscriptions = subscriptionsSnapshot.docs.map(doc => doc.data());
      const activeSubscriptions = subscriptions.filter(s => s.status === 'active').length;
      const expiredSubscriptions = subscriptions.filter(s => s.status === 'expired').length;
      const pendingSubscriptions = subscriptions.filter(s => s.status === 'pending').length;

      // Calculate total revenue
      const totalRevenue = subscriptions.reduce((sum, sub) => sum + (sub.amountPaid || 0), 0);

      // Process wallets
      const wallets = walletsSnapshot.docs.map(doc => doc.data());
      const systemWallet = wallets.find(w => w.ownerType === 'system');
      const coachWallets = wallets.filter(w => w.ownerType === 'coach');
      const totalCoachEarnings = coachWallets.reduce((sum, w) => sum + (w.totalEarned || 0), 0);
      const totalSystemEarnings = systemWallet?.totalEarned || 0;
      const totalPlatformBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

      // Monthly revenue chart data (last 6 months)
      const monthlyRevenue = this.calculateMonthlyRevenue(subscriptions);

      // Strategy distribution
      const strategyDistribution = this.calculateStrategyDistribution(subscriptions, strategies);

      // User growth (last 7 days)
      const userGrowth = this.calculateUserGrowth(users);

      // Top coaches by earnings
      const topCoaches = coachWallets
        .sort((a, b) => (b.totalEarned || 0) - (a.totalEarned || 0))
        .slice(0, 5)
        .map(w => ({
          name: w.ownerName,
          earnings: w.totalEarned || 0,
          balance: w.balance || 0,
        }));

      const stats = {
        overview: {
          totalUsers: users.length,
          activeUsers,
          bannedUsers,
          totalCoaches: coaches.length,
          approvedCoaches,
          pendingCoaches,
          rejectedCoaches,
          bannedCoaches,
          totalStrategies: strategies.length,
          activeStrategies,
          totalSubscriptions: subscriptions.length,
          activeSubscriptions,
          expiredSubscriptions,
          pendingSubscriptions,
        },
        financial: {
          totalRevenue,
          totalSystemEarnings,
          totalCoachEarnings,
          totalPlatformBalance,
          averageSubscriptionValue: subscriptions.length > 0 ? totalRevenue / subscriptions.length : 0,
        },
        users: {
          total: users.length,
          active: activeUsers,
          banned: bannedUsers,
          withCoaches: usersWithCoaches,
          withoutCoaches: usersWithoutCoaches,
        },
        coaches: {
          total: coaches.length,
          approved: approvedCoaches,
          pending: pendingCoaches,
          rejected: rejectedCoaches,
          banned: bannedCoaches,
        },
        subscriptions: {
          total: subscriptions.length,
          active: activeSubscriptions,
          expired: expiredSubscriptions,
          pending: pendingSubscriptions,
        },
        charts: {
          monthlyRevenue,
          strategyDistribution,
          userGrowth,
          topCoaches,
        },
      };

      console.log('✅ [DASHBOARD] Statistics fetched successfully');
      return stats;
    } catch (error) {
      console.error('❌ [DASHBOARD] Error fetching statistics:', error);
      throw error;
    }
  }

  private calculateMonthlyRevenue(subscriptions: any[]): any[] {
    const months: any[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleString('default', { month: 'short' });
      const year = date.getFullYear();

      const monthRevenue = subscriptions
        .filter(sub => {
          const subDate = sub.createdAt?.toDate ? sub.createdAt.toDate() : new Date(sub.createdAt);
          return subDate.getMonth() === date.getMonth() && subDate.getFullYear() === date.getFullYear();
        })
        .reduce((sum, sub) => sum + (sub.amountPaid || 0), 0);

      months.push({
        month: `${monthName} ${year}`,
        revenue: parseFloat(monthRevenue.toFixed(2)),
      });
    }

    return months;
  }

  private calculateStrategyDistribution(subscriptions: any[], strategies: any[]): any[] {
    const distribution = strategies.map(strategy => {
      const count = subscriptions.filter(sub => sub.strategyId === strategy.id).length;
      return {
        name: strategy.name || `Strategy ${strategy.number}`,
        value: count,
        percentage: subscriptions.length > 0 ? ((count / subscriptions.length) * 100).toFixed(1) : 0,
      };
    });

    return distribution.filter(d => d.value > 0);
  }

  private calculateUserGrowth(users: any[]): any[] {
    const days: any[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayName = date.toLocaleDateString('default', { weekday: 'short' });

      const dayUsers = users.filter(user => {
        const userDate = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
        return userDate.toDateString() === date.toDateString();
      }).length;

      days.push({
        day: dayName,
        users: dayUsers,
      });
    }

    return days;
  }
}

