Pod::Spec.new do |s|
  s.name           = 'TenfoldEngine'
  s.version        = '0.2.0'
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
  s.frameworks = 'AVFoundation', 'CoreMedia', 'CoreText', 'QuartzCore', 'Vision', 'Speech', 'Photos', 'PhotosUI', 'UniformTypeIdentifiers'

  # Swift/Objective-C compatibility
  # TODO: switch to Swift 6 language mode once verified on Xcode 26 (core already type-checks in Swift 6).
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files = "Tests/**/*"
end
