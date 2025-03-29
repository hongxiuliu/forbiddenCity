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
    innerAudioContext: null,
    locationAccurate: false,
    locationInterval: null, // 定位定时器
    lastLocation: null, // 上一次定位坐标
    locationUpdateInterval: 10000, // 定位更新间隔10秒
    significantChangeDistance: 0.0005, // 认为位置显著变化的距离阈值(约50米)
    chooseGeneralExplanation:false
  },

  onLoad() {
    this.checkVoiceAvailability()
    this.checkLocationAuth()
  },

  onShow() {
    const selectPalace = wx.getStorageSync('selectedPalace')
    if (selectPalace) {
      this.setData({
        currentBuilding: selectPalace
      })
      var content = this.getBuildingExplanation(this.data.currentBuilding)
      
      this.setData({ 
        explanationText: content,
      })
      
      this.startVoiceExplanation()
    }
  },

  // 检查语音功能可用性
  checkVoiceAvailability() {
    const isAvailable = true
    this.setData({ voiceAvailable: isAvailable })
    
    if (!isAvailable) {
      console.warn('语音功能不可用，将降级为文字讲解')
    }
  },

  // 检查位置权限
  checkLocationAuth() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation'] === true) {
          this.setData({ 
            hasLocationAuth: true,
            showAuthPanel: false 
          })
          this.startLocationUpdates()
        } else if (res.authSetting['scope.userLocation'] === false) {
          this.setData({ 
            showAuthPanel: true,
            hasLocationAuth: false 
          })
        } else {
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

  // 开始定期获取位置
  startLocationUpdates() {
    // 先获取一次位置
    this.getUserLocation()
    
    // 设置定时器定期获取位置
    this.data.locationInterval = setInterval(() => {
      this.getUserLocation()
    }, this.data.locationUpdateInterval)
  },

  // 停止位置更新
  stopLocationUpdates() {
    if (this.data.locationInterval) {
      clearInterval(this.data.locationInterval)
      this.data.locationInterval = null
    }
  },

  // 请求位置授权
  requestLocationAuth() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation'] === undefined) {
          wx.authorize({
            scope: 'scope.userLocation',
            success: () => {
              this.setData({ 
                showAuthPanel: false,
                hasLocationAuth: true 
              })
              this.startLocationUpdates()
            },
            fail: (err) => this.handleAuthFail(err)
          })
        } else if (res.authSetting['scope.userLocation'] === false) {
          this.showManualAuthGuide()
        } else {
          this.startLocationUpdates()
        }
      }
    })
  },
  
  // 处理授权失败
  handleAuthFail(err) {
    if (err.errMsg.includes('auth deny')) {
      this.showManualAuthGuide()
    } else {
      wx.showToast({ title: '系统错误，请重试', icon: 'none' })
    }
  },
  
  // 显示手动授权引导
  showManualAuthGuide() {
    this.setData({ 
      showAuthPanel: true,
      errorMsg: '请在手机设置中允许位置权限'
    })
    wx.showModal({
      title: '权限不足',
      content: '需要您的位置权限提供讲解服务，请点击"去设置"开启权限',
      confirmText: '去设置',
      success: (res) => {
        if (res.confirm) {
          wx.openSetting()
          this.setData({
            showAuthPanel: false,
            hasLocationAuth: true,
            errorMsg: ''
          })
        }
        else{
          this.setData({
            chooseGeneralExplanation:true,
            showAuthPanel:false,
            errorMsg:''
          })
        } 
      }
    })
  },

  // 获取用户位置
  getUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true, // 开启高精度定位
      success: (res) => {
        const { latitude, longitude, accuracy } = res
        
        // 检查位置是否有显著变化
        if (this.isSignificantLocationChange(latitude, longitude)) {
          this.setData({ 
            errorMsg: '',
            locationError: false 
          })
          
          app.globalData.userLocation = { latitude, longitude }
          this.checkIfInForbiddenCity(latitude, longitude)
          
          // 更新最后位置
          this.data.lastLocation = { latitude, longitude }
        }
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

  // 检查位置是否显著变化
  isSignificantLocationChange(newLat, newLng) {
    if (!this.data.lastLocation) return true
    console.log(this.data.lastLocation.latitude, "  ",this.data.lastLocation.longitude)
    const latDiff = Math.abs(newLat - this.data.lastLocation.latitude)
    const lngDiff = Math.abs(newLng - this.data.lastLocation.longitude)
    return latDiff > this.data.significantChangeDistance || 
           lngDiff > this.data.significantChangeDistance
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

  // 检查是否在故宫范围内
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
      const building = this.determineCurrentBuilding(lat, lng)
      if (building && building !== this.data.currentBuilding) {
        // 位置变化且建筑变化时更新讲解
        this.setData({ currentBuilding: building })
        this.updateExplanation(building)
      }
    } else if (this.data.currentBuilding) {
      // 离开故宫范围时清除当前建筑
      this.setData({ currentBuilding: '' })
    }
  },

  // 确定当前位置对应的建筑
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
        return building.name
      }
    }
    return null
  },

  // 更新讲解内容
  updateExplanation(building) {
    if (this.data.isExplaining) {
      // 如果正在讲解，停止当前讲解
      this.stopExplanation()
      
      // 获取新建筑的讲解内容
      const content = this.getBuildingExplanation(building)
      this.setData({ 
        explanationText: content,
        currentBuilding: building
      })
      
      // 开始新讲解
      this.startVoiceExplanation()
    }
  },

  onVoiceChange(e) {
    app.globalData.voiceType = e.detail.value
  },
  
  onStyleChange(e) {
    app.globalData.styleType = e.detail.value
  },

  startAIExplanation() {
    if (!this.data.hasLocationAuth && !app.globalData.userLocation&&!this.data.chooseGeneralExplanation) {
      this.setData({ 
        showAuthPanel: true,
        errorMsg: '需要位置权限才能提供精准讲解'
      })
      return
    }
    
    this.setData({ 
      isExplaining: true,
      locationAccurate: false,
      errorMsg: '' 
    })
    this.getExplanationContent()
  },

  getExplanationContent() {
    let content = ''
    let building = ''
    
    if (app.globalData.isInForbiddenCity && this.data.currentBuilding) {
      building = this.data.currentBuilding
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
    const professionalExplanations = {
      '太和殿': '太和殿，俗称"金銮殿"，是故宫最宏伟的建筑，也是中国现存最大的木结构大殿。它建于明永乐十八年（1420年），是皇帝举行重大典礼的场所，如登基大典、元旦、冬至等节日庆典以及皇帝大婚等。殿高35.05米，面积2377平方米，殿顶为重檐庑殿顶，殿内有72根大柱支撑，其中6根是沥粉贴金蟠龙柱。',
      '中和殿': '中和殿位于太和殿与保和殿之间，是一座方形殿宇。这里是皇帝去太和殿举行大典前休息和接受执事官员朝拜的地方。在祭祀天地和太庙之前，皇帝会在这里阅读祭文。殿名"中和"取自《礼记·中庸》："中也者，天下之大本也；和也者，天下之达道也。"体现了儒家思想中的中庸之道。',
      '保和殿': '保和殿是故宫三大殿之一，位于中和殿之后。明代这里是皇帝更衣和册立皇后、皇太子的场所。清代这里成为举行殿试的地方，皇帝亲自在这里主持科举考试的最高一级——殿试。殿名"保和"意为保持天地万物和谐，出自《尚书》："保合大和，乃利贞"。',
      '乾清宫': '乾清宫是内廷后三宫之首，明代至清初是皇帝的寝宫。雍正皇帝后将寝宫移至养心殿，这里成为皇帝处理日常政务、批阅奏章、接见外国使节的地方。乾清宫正殿高悬着顺治皇帝御笔亲书的"正大光明"匾，清代秘密立储的诏书就藏于匾后。',
      '坤宁宫': '坤宁宫是内廷后三宫之一，明代是皇后的寝宫。清代按照满族习俗将其改造为祭神场所，东暖阁成为皇帝大婚的洞房。康熙、同治、光绪三位皇帝的大婚都在此举行。宫中保留有萨满教祭祀的器具和布置，反映了满族的宗教信仰。'
    }
    const humorExplanations={
      '太和殿': '欢迎来到"古代CEO豪华办公室"！这个金光闪闪的大房子，便是皇帝们用来吓唬大臣的"终极武器"。想象一下：每天凌晨三点，文武百官已经在广场上排队，等着皇帝从那个雕满金龙的宝座上发号施令。最惨的是那些老臣，跪在凹凸不平的"仪仗墩"上，一跪就是大半天，放到现在，绝对能告他个"职场虐待"！不过皇帝也不好当，夏天还得穿着十几斤的龙袍坐在这"蒸笼"里，估计心里一直想着什么时候能回乾清宫乘凉歇息。',
      '中和殿': '这个长得像"黄金凉亭"的建筑，其实是皇帝的"中场休息室"。在大典前，皇帝要在这儿整理仪容、背诵台词，或者叫祝文，简直就像明星上台前的化妆间！想象一下那些铜龟铜鹤，整天摆着严肃脸，其实内心可能在吐槽："又要加班看皇帝彩排..."再看殿里那个宝座，看着气派，但据说皇帝每次只能坐几分钟，毕竟只是个"候场区"，要是在这睡着了可就要闹笑话了！',
      '保和殿': '保和殿，古代"高考考场的VIP包厢"！想象一下：几百个学霸挤在这金碧辉煌的大殿里考试，皇帝坐在上头监考，这压力比现代考场装监控摄像头刺激多了！考得好能当"公务员"，考不好...嗯，回家种地。那些考生可怜又好笑，为了防作弊得穿"特制服装"——单层薄袍，连鞋底都要检查，安检规格比机场还严格！不过比起现在的高考，他们至少不用考英语...',
      '乾清宫': '这里就是传说中的"皇帝卧室+办公室"二合一公寓！别看现在安安静静，当年可是宫斗剧的主战场。那个著名的"正大光明"匾，就是古代版"保险柜"——雍正爷把遗嘱藏这儿，估计是觉得"最危险的地方最安全"。在这就不得不提一嘴皇帝的"加班日常"：批奏折到深夜，饿了只能啃两口点心（虽然都是御厨特供），这工作强度让现在的996都自愧不如！冬天倒是有地暖，但夏天就只能靠太监们手动扇风，要是穿越回去，建议给雍正爷带个USB小风扇...',
      '坤宁宫': '这个"精装修婚房+烧烤餐厅+佛堂"多合一的神奇宫殿，绝对是紫禁城里的"混搭之王"！明朝皇后住这儿时肯定想不到，清朝这里会变成"大型烤肉现场"——每年要在这里煮两头猪祭祀，油烟把梁柱都熏出了包浆！据说那个"婚房体验区"，光绪皇帝大婚时在这住过三天，之后就再没用过，堪称史上最浪费的"蜜月套房"。刚失恋的朋友慎入，否则看到那些龙凤喜被，容易受到暴击...'
    }
    const vividExplanations={
      '太和殿': '当第一缕阳光掠过太和殿的琉璃檐角，整座大殿仿佛被注入生命。蟠龙藻井在晨光中苏醒，金漆宝座上的龙纹似乎随时会腾空而起。轻抚殿前的汉白玉栏杆，冰凉的触感中仿佛还能感受到当年大典时万人跪拜的震颤。驻足殿内，似乎能听见康熙平定三藩时铿锵的诏令，乾隆接见使节时环佩的叮当。那些被金砖磨平的纹路，记录着多少改变历史的重大决策？',
      '中和殿': '春日午后，中和殿的琉璃宝顶在阳光下流转着蜜糖般的光泽。微风拂过檐角的铜铃，发出清越的声响，仿佛在提醒过往的帝王："时辰将至"。轻推朱漆隔扇，阳光透过棂花在地面投下斑驳的光影，那些光影中是否还残留着雍正批阅奏折时滴落的墨迹？殿前铜鹤昂首向天的姿态，定格了某个雪夜乾隆在此沉思的剪影。',
      '保和殿': '秋高气爽的时节，保和殿的鎏金斗拱在蓝天下格外耀眼。指尖划过殿试时考生们倚靠的朱漆立柱，木纹中似乎还浸染着墨香。恍惚间，仿佛看见纪晓岚在此挥毫泼墨，听见落第举子压抑的叹息。夕阳西下时，殿前的御路石上映出细长的影子，宛如当年鱼贯而出的进士们留下的足迹。',
      '乾清宫': '暮色中的乾清宫，窗棂透出昏黄的烛光，仿佛还能看见雍正伏案批阅奏折的身影。手指轻触冰凉的青玉案几，墨砚中似乎还漾着未干的朱砂。穿堂风掠过东暖阁的纱帐，带起一阵若有若无的龙涎香，那是某个深夜康熙召见重臣时留下的气息。抬头望见"正大光明"匾，阳光透过尘埃在匾额上流转，照亮了那段秘密立储的惊心动魄。',
      '坤宁宫': '推开坤宁宫的雕花门扇，浓郁的松木香扑面而来，那是萨满祭祀时燃烧的枝叶余韵。阳光透过东暖阁的红色纱帐，在喜床上投下斑驳的光影，仿佛还能看见年轻的光绪帝后羞涩相对的身影。西侧佛堂的檀香与东侧神堂的肉香奇异地交融，勾勒出满汉文化碰撞的独特图景。指尖触碰煮肉大锅边缘的油渍，突然理解了什么叫做"人间烟火气，最抚凡人心"。'
    }
    var explanations=null
    switch (app.globalData.styleType) {
      case 'professional':
        explanations=professionalExplanations
        break;
      case 'humor':
        explanations= humorExplanations
      break;
      default:
        explanations=vividExplanations
        break;
    }
    return explanations[building] 
  },

  getGeneralExplanation() {
    const generalExplanations={
      'professional':'故宫建筑群的空间序列暗合《周礼》"五门三朝"制度，从大清门（已拆）到景山，形成长达1.6公里的礼仪轴线。其防御体系包含52米宽的护城河、10米高的宫墙、四座角楼及严格的禁卫制度。建筑色彩体系具有深刻文化内涵：黄色琉璃瓦象征皇权，红色墙面代表吉祥喜庆，青白石基座寓意社稷永固。排水系统设计精妙，通过"明沟暗渠"三级排水网络和"千龙吐水"的螭首设计，确保600年不涝。现存文物186万余件，涵盖青铜、陶瓷、书画等31大类，构成完整的中华文明物质谱系。故宫的保护与修复严格遵循"最小干预"原则，养心殿研究性保护项目开创了文化遗产保护的新模式。',
      'humor':'这座"古代超级豪宅区"简直就是基建狂魔的炫技之作！72万平方米的建筑面积，光屋顶琉璃瓦就用了上百万片，这装修预算放现在能买下整个CBD！最绝的是排水系统，暴雨天看"千龙吐水"的奇观，比什么音乐喷泉都带劲。那些每天在宫里暴走的游客可能不知道，自己踩着的金砖其实比爱马仕还贵——每块都得精炼七年！故宫现在的网红操作也是层出不穷：VR逛展、文创雪糕、御猫直播...朱棣要是知道他的办公室变成这样，估计得惊掉龙须！',
      'vivid':'当暮鼓响起，故宫的剪影在晚霞中渐渐沉淀。护城河的水面倒映着角楼的身影，六百年的时光在这里变得温柔。轻抚宫墙上斑驳的彩画，指腹感受到的是无数工匠的温度；驻足太和殿前，仿佛听见万国来朝时山呼万岁的声浪。那些在廊柱间流转的光影，那些在砖缝中生长的野草，都在诉说着一个永恒的真理：最伟大的建筑，终究要成为容纳众生故事的容器。此刻的故宫，既是历史的终点，也是未来的起点。'
    }
    
    return generalExplanations[app.globalData.styleType]
  },

  startVoiceExplanation() {
    if (!this.data.voiceAvailable) {
      wx.showToast({
        title: '语音不可用，已转为文字讲解',
        icon: 'none'
      })
      return
    }
    
    const currentPlugin = requirePlugin('wechatSI')
    this.setData({ plugin: currentPlugin })
    
    // console.log(`使用${app.globalData.voiceType === 'male' ? '男声' : '女声'}${app.globalData.styleType == 'professional' ? '学术风格' : '网红风格'}朗读`)
    this.playTextToVoice()
  },
  
  playTextToVoice() {
    this.data.plugin.textToSpeech({
      lang: 'zh_CN',
      content: this.data.explanationText,
      success: (res) => {
        console.log('语音合成成功', res)
        const audioUrl = res.filename
        this.playAudio(audioUrl)
      },
      fail: (err) => {
        console.error('语音合成失败', err)
      }
    })
  },
  
  playAudio(audioUrl) {
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop()
      this.data.innerAudioContext = null
    }
    
    this.data.innerAudioContext = wx.createInnerAudioContext()
    this.data.innerAudioContext.src = audioUrl
    this.data.innerAudioContext.play()
    
    // 监听播放结束事件
    this.data.innerAudioContext.onEnded(() => {
      this.setData({ isExplaining: false })
    })
  },
  
  stopExplanation() {
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop()
      this.data.innerAudioContext = null
    }
    this.setData({ isExplaining: false })
  },
  
  selectPalace() {
    wx.navigateTo({
      url: '/pages/selectPage/selectPalace'
    })
  },
  
  notSelectPalace() {
    this.setData({ locationAccurate: true })
  },
  
  onUnload() {
    this.stopLocationUpdates()
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop()
      this.data.innerAudioContext = null
    }
    wx.removeStorageSync('selectedPalace')
  },
  
  onHide() {
    this.stopLocationUpdates()
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop()
      this.data.innerAudioContext = null
    }
    wx.removeStorageSync('selectedPalace')
  }
})