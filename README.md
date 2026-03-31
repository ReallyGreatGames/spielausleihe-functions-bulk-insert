import function from github

Set API KEY as ENV Variable
Set Execution permissons (Execute access) to label admin
activte functions in project settings
set scope to database

    Navigate to Functions > [Your Function] > Settings > Variables.
    Change APPWRITE_FUNCTION_API_ENDPOINT to:
        http://172.17.0.1/v1 (This is the default Docker gateway IP).