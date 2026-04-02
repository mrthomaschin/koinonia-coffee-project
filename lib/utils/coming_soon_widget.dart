import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:koinonia_coffee_project/constants_library.dart';
import 'package:koinonia_coffee_project/utils/helpers.dart';

class ComingSoonWidget extends StatelessWidget {
  const ComingSoonWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: getAvailableHeight(context)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 40),
        decoration: BoxDecoration(color: ConstantsLibrary.clPearlPrimaryColor),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SvgPicture.asset(
              ConstantsLibrary.clLogoMark,
              height: 50,
              colorFilter: const ColorFilter.mode(
                ConstantsLibrary.clMarinaPrimaryColor,
                BlendMode.srcIn,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Coming Soon!',
              style: TextStyle(
                fontFamily: ConstantsLibrary.clPrimaryFont,
                fontSize: 32,
                fontWeight: FontWeight.bold,
                color: ConstantsLibrary.clMidnightPrimaryColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
