import 'package:url_launcher/url_launcher.dart';

class BottomBarBloc {
  BottomBarBloc();

  void openInstagram() async {
    final uri = Uri.parse('https://www.instagram.com/koinoniacoffeeproject');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.platformDefault);
    }
  }

  void openEmail() async {
    final uri = Uri.parse('mailto:hello@koinoniacoffeeproject.com');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}
