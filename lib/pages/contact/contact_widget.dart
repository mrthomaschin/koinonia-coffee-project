import 'package:flutter/material.dart';
import 'package:koinonia_coffee_project/constants_library.dart';
import 'package:koinonia_coffee_project/pages/contact/contact_bloc.dart';

class ContactWidget extends StatefulWidget {
  const ContactWidget({
    super.key,
    required this.bloc,
    required this.availableHeight,
  });

  final ContactBloc bloc;
  final double availableHeight;

  @override
  State<ContactWidget> createState() => _ContactWidgetState();
}

class _ContactWidgetState extends State<ContactWidget> {
  Widget _buildTextSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 20),
        const Text(
          'Contact us!',
          style: TextStyle(
            fontFamily: ConstantsLibrary.clPrimaryFont,
            fontSize: 40,
            fontWeight: FontWeight.bold,
            color: ConstantsLibrary.clMidnightPrimaryColor,
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'We\'d love to hear from you! Whether you have a question, feedback, or just want to say hello, feel free to reach out.',
          style: TextStyle(
            fontFamily: ConstantsLibrary.clBodyFont,
            fontSize: 18,
            color: ConstantsLibrary.clMidnightPrimaryColor,
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          'Email:',
          style: TextStyle(
            fontFamily: ConstantsLibrary.clBodyFont,
            fontSize: 18,
            color: ConstantsLibrary.clMidnightPrimaryColor,
          ),
        ),
        const Text(
          'hello@koinoniacoffeeproject.com',
          style: TextStyle(
            fontFamily: ConstantsLibrary.clBodyFont,
            fontSize: 18,
            color: ConstantsLibrary.clMidnightPrimaryColor,
          ),
        ),
      ],
    );
  }

  Widget _buildFormSection() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: ConstantsLibrary.clSageSecondaryColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Form(
        key: widget.bloc.formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: _buildNavItem(
                    'First Name',
                    'Please enter your first name',
                    widget.bloc.firstNameController,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildNavItem(
                    'Last Name',
                    'Please enter your last name',
                    widget.bloc.lastNameController,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            _buildNavItem(
              'Phone',
              'Please enter your phone number',
              widget.bloc.phoneController,
            ),
            const SizedBox(height: 20),
            _buildNavItem(
              'Email',
              'Please enter your email',
              widget.bloc.emailController,
            ),
            const SizedBox(height: 20),
            _buildNavItem(
              'Message',
              'Please enter your message',
              widget.bloc.messageController,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => widget.bloc.submitForm(context),
              style: ElevatedButton.styleFrom(
                backgroundColor: ConstantsLibrary.clEucalyptusSecondaryColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.all(Radius.circular(8)),
                ),
              ),
              child: const Text(
                'SEND MESSAGE',
                style: TextStyle(
                  fontFamily: ConstantsLibrary.clSlugFont,
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  letterSpacing: 1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavItem(
    String labelText,
    String validatorText,
    TextEditingController controller,
  ) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: labelText,
        labelStyle: TextStyle(
          fontFamily: ConstantsLibrary.clBodyFont,
          color: ConstantsLibrary.clMidnightPrimaryColor,
        ),
        filled: true,
        fillColor: ConstantsLibrary.clWhiteColor,
        border: const OutlineInputBorder(),
        focusedBorder: const OutlineInputBorder(
          borderSide: BorderSide(
            color: ConstantsLibrary.clMidnightPrimaryColor,
            width: 2,
          ),
        ),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return validatorText;
        }
        if (labelText == 'Email' && !value.contains('@')) {
          return 'Please enter a valid email';
        }
        return null;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final minHeight = widget.availableHeight;

    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: minHeight),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 40),
        decoration: const BoxDecoration(
          color: ConstantsLibrary.clPearlPrimaryColor,
        ),
        child: Builder(
          builder: (context) {
            final screenWidth = MediaQuery.sizeOf(context).width;
            final isMobile = screenWidth < 768;

            return isMobile
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildTextSection(),
                      const SizedBox(height: 40),
                      _buildFormSection(),
                    ],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _buildTextSection()),
                      const SizedBox(width: 60),
                      Flexible(child: _buildFormSection()),
                    ],
                  );
          },
        ),
      ),
    );
  }
}
