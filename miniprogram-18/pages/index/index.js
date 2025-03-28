const app = getApp()

Page({
  data: {
    isExplaining: false,
    explanationText: '',
    currentBuilding: '',
    showAuthPanel: false,
    errorMsg: '',
    locationError: false,
    hasLocationAuth: false,
    voiceAvailable: true,
    plugin: null,
    innerAudioContext:null,
  },

  onLoad() {
    this.checkVoiceAvailability()
    this.checkLocationAuth()
  },

  checkVoiceAvailability() {
    // 在实际应用中，这里可以检测语音功能是否真的可用
    // 现在我们模拟检测过程，假设有10%的概率不可用
    const isAvailable = true
    this.setData({ voiceAvailable: isAvailable })
    
    if (!isAvailable) {
      console.warn('语音功能不可用，将降级为文字讲解')
    }
  },

  checkLocationAuth() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation'] === true) {
          // 用户已经授权
          this.setData({ 
            hasLocationAuth: true,
            showAuthPanel: false 
          })
          this.getUserLocation()
        } else if (res.authSetting['scope.userLocation'] === false) {
          // 用户已拒绝授权
          this.setData({ 
            showAuthPanel: true,
            hasLocationAuth: false 
          })
        } else {
          // 还未询问过授权
          this.requestLocationAuth()
        }
      },
      fail: (err) => {
        console.error('检查权限设置失败:', err)
        this.setData({ 
          errorMsg: '检查位置权限失败，请重试',
          locationError: true
        })
      }
    })
  },

  requestLocationAuth() {
    // 先检查当前权限状态
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation'] === undefined) {
          // 首次询问授权
          wx.authorize({
            scope: 'scope.userLocation',
            success: () => {
              this.setData({ 
                showAuthPanel: false,
                hasLocationAuth: true });
              this.getUserLocation();
            },
            fail: (err) => this.handleAuthFail(err)
          });
        } else if (res.authSetting['scope.userLocation'] === false) {
          // 用户之前拒绝过，直接引导去设置
          this.showManualAuthGuide();
        } else {
          // 已有权限
          this.getUserLocation();
        }
      }
    });
  },
  
  // 处理授权失败
  handleAuthFail(err) {
    if (err.errMsg.includes('auth deny')) {
      this.showManualAuthGuide();
    } else {
      wx.showToast({ title: '系统错误，请重试', icon: 'none' });
    }
  },
  
  // 显示手动授权引导
  showManualAuthGuide() {
    this.setData({ 
      showAuthPanel: true,
      errorMsg: '请在手机设置中允许位置权限'
    });
    wx.showModal({
      title: '权限不足',
      content: '需要您的位置权限提供讲解服务，请点击“去设置”开启权限',
      confirmText: '去设置',
      success: (res) => {
        if (res.confirm){
          wx.openSetting();
          this.setData({
            showAuthPanel:false,
            hasLocationAuth:true,
            errorMsg: ''
          })
        } 
       }
    });
  },
  getUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const { latitude, longitude } = res
        app.globalData.userLocation = { latitude, longitude }
        this.checkIfInForbiddenCity(latitude, longitude)
        this.setData({ 
          errorMsg: '',
          locationError: false 
        })
      },
      fail: (err) => {
        console.error('获取位置失败:', err)
        this.setData({ 
          errorMsg: '获取位置失败，将提供通用讲解',
          locationError: true
        })
      }
    })
  },

  retryLocation() {
    this.setData({ errorMsg: '' })
    this.getUserLocation()
  },

  useWithoutLocation() {
    this.setData({ 
      showAuthPanel: false,
      errorMsg: '您选择了不使用位置服务，将提供通用讲解'
    })
    app.globalData.isInForbiddenCity = false
    this.startVoiceExplanation(this.getGeneralExplanation())
  },

  checkIfInForbiddenCity(lat, lng) {
    // 故宫大致坐标范围
    const forbiddenCityLat = 39.916
    const forbiddenCityLng = 116.397
    const radius = 0.0045 // 大约500米
    
    const inRange = 
      Math.abs(lat - forbiddenCityLat) < radius && 
      Math.abs(lng - forbiddenCityLng) < radius
    
    app.globalData.isInForbiddenCity = inRange
    
    if (inRange) {
      this.determineCurrentBuilding(lat, lng)
    }
  },

  determineCurrentBuilding(lat, lng) {
    const buildings = [
      { name: '太和殿', lat: 39.916, lng: 116.397, radius: 0.0003 },
      { name: '中和殿', lat: 39.9158, lng: 116.397, radius: 0.0003 },
      { name: '保和殿', lat: 39.9156, lng: 116.397, radius: 0.0003 },
      { name: '乾清宫', lat: 39.915, lng: 116.397, radius: 0.0003 },
      { name: '坤宁宫', lat: 39.9148, lng: 116.397, radius: 0.0003 }
    ]
    
    for (const building of buildings) {
      if (
        Math.abs(lat - building.lat) < building.radius && 
        Math.abs(lng - building.lng) < building.radius
      ) {
        app.globalData.currentBuilding = building.name
        break
      }
    }
  },

  onVoiceChange(e) {
    app.globalData.voiceType = e.detail.value
  },

  startAIExplanation() {
    if (!this.data.hasLocationAuth && !app.globalData.userLocation) {
      this.setData({ 
        showAuthPanel: true,
        errorMsg: '需要位置权限才能提供精准讲解'
      })
      return
    }
    
    this.setData({ 
      isExplaining: true,
      errorMsg: '' 
    })
    this.getExplanationContent()
  },

  getExplanationContent() {
    let content = ''
    let building = ''
    
    if (app.globalData.isInForbiddenCity && app.globalData.currentBuilding) {
      building = app.globalData.currentBuilding
      content = this.getBuildingExplanation(building)
    } else {
      content = this.getGeneralExplanation()
    }
    
    this.setData({ 
      explanationText: content,
      currentBuilding: building
    })
    
    this.startVoiceExplanation()
  },

  getBuildingExplanation(building) {
    const explanations = {
      '太和殿': '太和殿，俗称"金銮殿"，是故宫最宏伟的建筑，也是中国现存最大的木结构大殿。它建于明永乐十八年（1420年），是皇帝举行重大典礼的场所，如登基大典、元旦、冬至等节日庆典以及皇帝大婚等。殿高35.05米，面积2377平方米，殿顶为重檐庑殿顶，殿内有72根大柱支撑，其中6根是沥粉贴金蟠龙柱。',
      '中和殿': '中和殿位于太和殿与保和殿之间，是一座方形殿宇。这里是皇帝去太和殿举行大典前休息和接受执事官员朝拜的地方。在祭祀天地和太庙之前，皇帝会在这里阅读祭文。殿名"中和"取自《礼记·中庸》："中也者，天下之大本也；和也者，天下之达道也。"体现了儒家思想中的中庸之道。',
      '保和殿': '保和殿是故宫三大殿之一，位于中和殿之后。明代这里是皇帝更衣和册立皇后、皇太子的场所。清代这里成为举行殿试的地方，皇帝亲自在这里主持科举考试的最高一级——殿试。殿名"保和"意为保持天地万物和谐，出自《尚书》："保合大和，乃利贞"。',
      '乾清宫': '乾清宫是内廷后三宫之首，明代至清初是皇帝的寝宫。雍正皇帝后将寝宫移至养心殿，这里成为皇帝处理日常政务、批阅奏章、接见外国使节的地方。乾清宫正殿高悬着顺治皇帝御笔亲书的"正大光明"匾，清代秘密立储的诏书就藏于匾后。',
      '坤宁宫': '坤宁宫是内廷后三宫之一，明代是皇后的寝宫。清代按照满族习俗将其改造为祭神场所，东暖阁成为皇帝大婚的洞房。康熙、同治、光绪三位皇帝的大婚都在此举行。宫中保留有萨满教祭祀的器具和布置，反映了满族的宗教信仰。'
    }
    
    return explanations[building] || this.getGeneralExplanation()
  },

  getGeneralExplanation() {
    return '故宫，又称紫禁城，是中国明清两代的皇家宫殿，位于北京中轴线的中心。故宫以三大殿为中心，占地面积72万平方米，建筑面积约15万平方米，有大小宫殿七十多座，房屋九千余间。故宫始建于明成祖永乐四年（1406年），到永乐十八年（1420年）建成，成为明清两朝二十四位皇帝的皇宫。故宫是世界上现存规模最大、保存最为完整的木质结构古建筑之一，1987年被列为世界文化遗产。故宫的建筑分为外朝和内廷两部分，外朝以太和殿、中和殿、保和殿为中心，是举行重大典礼的场所；内廷以乾清宫、交泰殿、坤宁宫为中心，是皇帝和后妃居住的地方。'
  },

  startVoiceExplanation() {
  
    
    if (!this.data.voiceAvailable) {
      // 语音不可用，直接显示文字讲解
      wx.showToast({
        title: '语音不可用，已转为文字讲解',
        icon: 'none'
      })
      return
    }
    const currentPlugin =requirePlugin('wechatSI')
    this.setData({plugin :currentPlugin})
    
    // console.log(`使用${app.globalData.voiceType === 'male' ? '男声' : '女声'}朗读: ${text}`)
    this.playTextToVoice()
  
  },
  playTextToVoice(){
    this.data.plugin.textToSpeech({
      lang: 'zh_CN',
      content: this.data.explanationText,
      success: (res) => {
        console.log('语音合成成功', res);
        const audioUrl = res.filename; // 获取语音合成的文件地址
        this.playAudio(audioUrl);
      },
      fail: (err) => {
        console.error('语音合成失败', err);
      }
    })
  },
  playAudio(audioUrl) {
    this.data.innerAudioContext = wx.createInnerAudioContext();
    this.data.innerAudioContext.src = audioUrl; // 设置音频地址
    this.data.innerAudioContext.play(); // 播放音频
  },
  stopExplanation() {
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop()
      this.data.innerAudioContext=null
    }
    this.setData({ isExplaining: false })
  },

  onUnload() {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop()
      this.innerAudioContext=null
    }
  }
})