# Test Plan

## Backend AWS System (Lambda) Test
Use this flow to invoke the controller Lambda directly with a sample MIME email.

```bash
# 1. Get the Function Name
FUNC_NAME=$(aws cloudformation describe-stacks --stack-name MailShieldStack --query "Stacks[0].Outputs[?OutputKey=='ControllerName'].OutputValue" --output text)
echo "🎯 Targeting Function: $FUNC_NAME"

# 2. Create the Payload (Using the content of email_261.eml)
# We wrap it in a JSON object because that is how Lambda receives arguments
cat <<EOF > test_event.json
{
  "mime_raw": "From: \"Sarah Miller\" <frontdesk@smileclinic.org>\\nTo: dr.martinez@smileclinic.org\\nSubject: Thursday Schedule and Patient Insurance Details\\nDate: Wed, 19 Nov 2025 10:00:00 -0800\\nMessage-ID: 20251119000261@smileclinic.org\\nContent-Type: text/plain; charset=\\\"utf-8\\\"\\n\\nGood morning Dr. Martinez,\\n\\nHere is the finalized schedule for Thursday, November 20.\\n\\n8:00 AM – Emily Carter (DOB 03/14/1989), Delta Dental, Member ID: DD-4829910.\\n9:00 AM – Michael Rivera (DOB 07/02/1975), UnitedHealthcare Dental.\\n\\nBest,\\nSarah"
}
EOF

# 3. Invoke the Lambda Directly
aws lambda invoke \
    --function-name $FUNC_NAME \
    --payload fileb://test_event.json \
    --cli-binary-format raw-in-base64-out \
    response.json

# 4. View the Result
echo ""
echo "📝 ANALYSIS RESULT:"
cat response.json
```
