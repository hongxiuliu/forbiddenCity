App({
    onLaunch() {
      // 小程序初始化时执行的逻辑
    },
    globalData: {
      userLocation: null,
      voiceType: 'female', // 默认女声
      isInForbiddenCity: false,
      currentBuilding: null
    }
  })