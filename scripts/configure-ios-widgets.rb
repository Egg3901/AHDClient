# Run after `tauri ios init`, before `tauri ios build`. Keep the extension in
# XcodeGen's source spec so project regeneration retains it.
require 'yaml'
require 'fileutils'
require 'json'

root = File.expand_path('..', __dir__)
tauri = File.join(root, 'apps/desktop/src-tauri')
project = File.join(tauri, 'gen/apple')
spec_path = File.join(project, 'project.yml')
spec = YAML.load_file(spec_path)
app_name, app = spec.fetch('targets').find { |name, target| target['type'] == 'application' && target['platform'] == 'iOS' }
abort 'Expected one iOS app target' unless app
group = 'group.net.lakesidegames.ahdclient'
keychain = '$(AppIdentifierPrefix)net.lakesidegames.ahdclient.widgets'
entitlements = { 'com.apple.security.application-groups' => [group], 'keychain-access-groups' => [keychain] }
app['entitlements'] ||= { 'path' => "#{app_name}/#{app_name}.entitlements" }
app['entitlements']['properties'] ||= {}
entitlements.each do |key, values|
  app['entitlements']['properties'][key] = (Array(app['entitlements']['properties'][key]) + values).uniq
end
app['dependencies'] ||= []
app['dependencies'] << { 'target' => 'AHDWidgets', 'embed' => true } unless app['dependencies'].any? { |d| d['target'] == 'AHDWidgets' }

extension = File.join(project, 'AHDWidgets')
FileUtils.mkdir_p(extension)
FileUtils.cp(File.join(tauri, 'ios-widgets/AHDWidgets.swift'), extension)
FileUtils.cp(File.join(tauri, 'plugins/briefing-widgets/ios/Sources/BriefingStore.swift'), extension)
version = JSON.parse(File.read(File.join(root, 'package.json'))).fetch('version')
app_info = app.fetch('info').fetch('properties')
spec['targets']['AHDWidgets'] = {
  'type' => 'app-extension', 'platform' => 'iOS', 'deploymentTarget' => '15.0',
  'sources' => [{ 'path' => 'AHDWidgets', 'excludes' => ['*.plist', '*.entitlements'] }],
  'settings' => {
    'groups' => ['app'],
    'base' => {
      'PRODUCT_NAME' => 'AHDWidgets',
      'PRODUCT_BUNDLE_IDENTIFIER' => 'net.lakesidegames.ahdclient.widgets',
      'SWIFT_VERSION' => '5.0', 'SKIP_INSTALL' => 'YES',
      'APPLICATION_EXTENSION_API_ONLY' => 'YES',
      'CODE_SIGN_STYLE' => 'Automatic'
    }
  },
  'info' => {
    'path' => 'AHDWidgets/Info.plist',
    'properties' => {
      'CFBundleDisplayName' => 'AHD Briefing',
      'CFBundleShortVersionString' => version,
      'CFBundleVersion' => app_info.fetch('CFBundleVersion').to_s,
      'AHDWidgetKeychainGroup' => keychain,
      'NSExtension' => { 'NSExtensionPointIdentifier' => 'com.apple.widgetkit-extension' }
    }
  },
  'entitlements' => { 'path' => 'AHDWidgets/AHDWidgets.entitlements', 'properties' => entitlements },
  'dependencies' => [{ 'sdk' => 'WidgetKit.framework' }, { 'sdk' => 'SwiftUI.framework' }, { 'sdk' => 'Security.framework' }]
}
File.write(spec_path, YAML.dump(spec))
abort 'XcodeGen failed' unless system('xcodegen', 'generate', '--spec', spec_path, '--project', project)
puts 'AHD Profile, Election and Corporation widgets added to the iOS app.'
