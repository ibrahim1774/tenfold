Pod::Spec.new do |s|
  s.name           = 'TenfoldEngine'
  s.version        = '0.1.0'
  s.summary        = 'On-device video engine for Tenfold'
  s.description    = 'Audio extraction, transcription, cut/zoom planning, caption rendering and export for Tenfold.'
  s.author         = 'Ibrahim'
  s.homepage       = 'https://github.com/ibrahim1774/tenfold'
  s.platforms      = {
    :ios => '26.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  # TODO(M1): switch to Swift 6 language mode with strict concurrency once it compiles under Xcode 26.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files = "Tests/**/*"
end
