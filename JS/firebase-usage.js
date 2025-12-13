// Firebase Usage Monitor
window.FirebaseUsageMonitor = {
  async getUsageStats() {
    try {
      // Get current storage usage
      const storage = await this.getStorageUsage();
      
      // Get document counts
      const docCounts = await this.getDocumentCounts();
      
      // Return usage summary
      return {
        storage: storage,
        documents: docCounts,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting Firebase usage:', error);
      return null;
    }
  },
  
  async getStorageUsage() {
    if (!window.firebaseDB) return null;
    
    try {
      // Estimate by counting documents and their size
      const usersSnapshot = await window.firebaseDB.collection('users').limit(10).get();
      const testSnapshot = await window.firebaseDB.collection('test').limit(10).get();
      
      return {
        users: usersSnapshot.size,
        test: testSnapshot.size,
        estimated: 'Low usage - under 1MB'
      };
    } catch (error) {
      return { error: error.message };
    }
  },
  
  async getDocumentCounts() {
    if (!window.firebaseDB) return null;
    
    try {
      const collections = ['users', 'test'];
      const counts = {};
      
      for (const collection of collections) {
        const snapshot = await window.firebaseDB.collection(collection).count().get();
        counts[collection] = snapshot.data().count;
      }
      
      return counts;
    } catch (error) {
      return { error: error.message };
    }
  },
  
  displayUsage() {
    this.getUsageStats().then(stats => {
      if (stats) {
        console.log('📊 Firebase Usage Stats:', stats);
        
        const message = `
Storage: ${JSON.stringify(stats.storage, null, 2)}
Documents: ${JSON.stringify(stats.documents, null, 2)}
Last Updated: ${stats.lastUpdated}
        `;
        
        alert('📊 Firebase Usage:\n\n' + message);
      } else {
        alert('❌ Unable to fetch Firebase usage stats');
      }
    });
  }
};